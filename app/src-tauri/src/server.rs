use actix_web::{get, web, App, HttpServer, HttpRequest, HttpResponse, Responder};
use actix_cors::Cors;
use crate::commands::TelegramState;
use crate::commands::utils::resolve_peer;
use grammers_client::types::Media;

use std::sync::Arc;

/// The port used by the Actix-web streaming server for media playback.
/// This MUST differ from the Vite dev server port (14200).
pub const STREAMING_PORT: u16 = 14201;

/// Maximum retries per chunk fetch before giving up on the stream.
const CHUNK_RETRY_COUNT: u32 = 3;

#[get("/stream/{folder_id}/{message_id}")]
async fn stream_media(
    req: HttpRequest,
    path: web::Path<(String, i32)>,
    data: web::Data<Arc<TelegramState>>,
) -> impl Responder {
    let (folder_id_str, message_id) = path.into_inner();
    log::info!("stream_media request received for folder: {}, message_id: {}", folder_id_str, message_id);

    // Parse folder ID
    let folder_id = if folder_id_str == "me" || folder_id_str == "home" || folder_id_str == "null" {
        log::debug!("Folder ID is root/home: {}", folder_id_str);
        None
    } else {
        match folder_id_str.parse::<i64>() {
            Ok(id) => {
                log::debug!("Parsed folder ID: {}", id);
                Some(id)
            },
            Err(e) => {
                log::error!("Failed to parse folder ID '{}': {}", folder_id_str, e);
                return HttpResponse::BadRequest().body("Invalid folder ID");
            }
        }
    };

    let client_opt = { data.client.lock().await.clone() };

    if let Some(client) = client_opt {
        log::debug!("Client connected, resolving peer...");
        match resolve_peer(&client, folder_id, &**data).await {
            Ok(peer) => {
                log::debug!("Peer resolved successfully, fetching message {}", message_id);
                match client.get_messages_by_id(&peer, &[message_id]).await {
                    Ok(messages) => {
                        if let Some(Some(msg)) = messages.first() {
                            if let Some(media) = msg.media() {
                                log::debug!("Message fetched successfully and contains media");
                                let total_size = match &media {
                                    Media::Document(d) => d.size() as u64,
                                    Media::Photo(_) => 0,
                                    _ => 0,
                                };

                                let mime = mime_type_from_media(&media);

                                // Parse Range header for seeking support
                                let range = parse_range_header(&req, total_size);

                                return match range {
                                    RangeResult::Full => {
                                        // No Range header — stream the entire file with aggregation
                                        let stream = build_buffered_stream(client, media);

                                        HttpResponse::Ok()
                                            .insert_header(("Content-Type", mime))
                                            .insert_header(("Content-Length", total_size.to_string()))
                                            .insert_header(("Accept-Ranges", "bytes"))
                                            .insert_header(("Cache-Control", "public, max-age=3600"))
                                            .streaming(stream)
                                    }
                                    RangeResult::Partial { start, end } => {
                                        let content_length = end - start + 1;

                                        // Use skip_chunks + chunk_size to seek into the file
                                        let chunk_size = 512 * 1024_i32; // MAX_CHUNK_SIZE
                                        let skip_chunks = (start / chunk_size as u64) as i32;
                                        let skip_bytes_in_first_chunk = (start % chunk_size as u64) as usize;

                                        let stream = build_range_stream(
                                            client, media,
                                            skip_chunks, skip_bytes_in_first_chunk,
                                            content_length,
                                        );

                                        HttpResponse::PartialContent()
                                            .insert_header(("Content-Type", mime))
                                            .insert_header(("Content-Length", content_length.to_string()))
                                            .insert_header(("Content-Range", format!("bytes {}-{}/{}", start, end, total_size)))
                                            .insert_header(("Accept-Ranges", "bytes"))
                                            .insert_header(("Cache-Control", "public, max-age=3600"))
                                            .streaming(stream)
                                    }
                                    RangeResult::Invalid => {
                                        HttpResponse::RangeNotSatisfiable()
                                            .insert_header(("Content-Range", format!("bytes */{}", total_size)))
                                            .finish()
                                    }
                                };
                            } else {
                                log::error!("Message {} contains no media", message_id);
                            }
                        } else {
                            log::error!("Message {} not found in folder {:?}", message_id, folder_id);
                        }
                        HttpResponse::NotFound().body("Message or media not found")
                    },
                    Err(e) => {
                        log::error!("Failed to fetch message {}: {}", message_id, e);
                        HttpResponse::InternalServerError().body(format!("Failed to fetch message: {}", e))
                    },
                }
            },
            Err(e) => {
                log::error!("Peer resolution failed for folder {:?}: {}", folder_id, e);
                HttpResponse::BadRequest().body(format!("Peer resolution failed: {}", e))
            },
        }
    } else {
        log::error!("Telegram client is not connected when attempting to stream.");
        HttpResponse::ServiceUnavailable().body("Telegram client not connected")
    }
}

/// Build a buffered stream that yields chunks immediately as they arrive.
/// This is used for full-file (non-Range) responses.
fn build_buffered_stream(
    client: grammers_client::Client,
    media: Media,
) -> impl futures::stream::Stream<Item = Result<web::Bytes, actix_web::Error>> {
    async_stream::stream! {
        let mut download_iter = client.iter_download(&media);
        let mut chunk_count = 0;

        loop {
            let chunk_result = fetch_chunk_with_retry(&mut download_iter).await;
            match chunk_result {
                Ok(Some(bytes)) => {
                    chunk_count += 1;
                    if chunk_count % 100 == 0 {
                        log::debug!("Buffered stream progress: {} chunks sent", chunk_count);
                    }
                    yield Ok::<_, actix_web::Error>(web::Bytes::from(bytes));
                }
                Ok(None) => {
                    log::debug!("Buffered stream finished after {} chunks", chunk_count);
                    break;
                }
                Err(e) => {
                    log::error!("Stream error after retries: {}", e);
                    break;
                }
            }
        }
    }
}

/// Build a stream for a Range request, skipping to the correct offset
/// and limiting output to `content_length` bytes.
fn build_range_stream(
    client: grammers_client::Client,
    media: Media,
    skip_chunks: i32,
    skip_bytes_in_first_chunk: usize,
    content_length: u64,
) -> impl futures::stream::Stream<Item = Result<web::Bytes, actix_web::Error>> {
    async_stream::stream! {
        let mut download_iter = client.iter_download(&media).skip_chunks(skip_chunks);
        let mut bytes_sent: u64 = 0;
        let mut is_first_chunk = true;
        let mut chunk_count = 0;

        loop {
            if bytes_sent >= content_length {
                log::debug!("Range stream completed. Total bytes sent: {}", bytes_sent);
                break;
            }

            let chunk_result = fetch_chunk_with_retry(&mut download_iter).await;
            match chunk_result {
                Ok(Some(bytes)) => {
                    chunk_count += 1;
                    if chunk_count % 100 == 0 {
                        log::debug!("Range stream progress: {} chunks sent", chunk_count);
                    }

                    let data = if is_first_chunk && skip_bytes_in_first_chunk > 0 {
                        is_first_chunk = false;
                        if skip_bytes_in_first_chunk >= bytes.len() {
                            continue; // skip this entire chunk
                        }
                        &bytes[skip_bytes_in_first_chunk..]
                    } else {
                        is_first_chunk = false;
                        &bytes[..]
                    };

                    let remaining = (content_length - bytes_sent) as usize;
                    let to_send = if data.len() > remaining { &data[..remaining] } else { data };

                    bytes_sent += to_send.len() as u64;
                    yield Ok::<_, actix_web::Error>(web::Bytes::from(to_send.to_vec()));
                }
                Ok(None) => {
                    log::debug!("Range stream reached end of file after {} chunks", chunk_count);
                    break;
                }
                Err(e) => {
                    log::error!("Range stream error after retries: {}", e);
                    break;
                }
            }
        }
    }
}

/// Fetch a single chunk with retry. Retries up to CHUNK_RETRY_COUNT times
/// with a short delay between attempts to handle VPN hiccups.
async fn fetch_chunk_with_retry(
    download_iter: &mut grammers_client::client::files::DownloadIter,
) -> Result<Option<Vec<u8>>, String> {
    for attempt in 1..=CHUNK_RETRY_COUNT {
        match download_iter.next().await {
            Ok(chunk) => return Ok(chunk),
            Err(e) => {
                if attempt < CHUNK_RETRY_COUNT {
                    log::warn!("Chunk fetch failed (attempt {}/{}): {}. Retrying in 2s...", attempt, CHUNK_RETRY_COUNT, e);
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                } else {
                    return Err(format!("Chunk fetch failed after {} attempts: {}", CHUNK_RETRY_COUNT, e));
                }
            }
        }
    }
    Ok(None) // unreachable, but satisfies compiler
}

/// Result of parsing the HTTP Range header.
enum RangeResult {
    /// No Range header — serve full file.
    Full,
    /// Valid Range — serve partial content.
    Partial { start: u64, end: u64 },
    /// Malformed or unsatisfiable Range.
    Invalid,
}

/// Parse the `Range: bytes=start-end` header.
fn parse_range_header(req: &HttpRequest, total_size: u64) -> RangeResult {
    let header = match req.headers().get("Range") {
        Some(h) => match h.to_str() {
            Ok(s) => s,
            Err(_) => return RangeResult::Full,
        },
        None => return RangeResult::Full,
    };

    if !header.starts_with("bytes=") {
        return RangeResult::Invalid;
    }

    let range_spec = &header[6..];
    let parts: Vec<&str> = range_spec.split('-').collect();
    if parts.len() != 2 {
        return RangeResult::Invalid;
    }

    let start = if parts[0].is_empty() {
        // Suffix range: bytes=-500 means last 500 bytes
        let suffix_len: u64 = match parts[1].parse() {
            Ok(n) => n,
            Err(_) => return RangeResult::Invalid,
        };
        if suffix_len > total_size {
            0
        } else {
            total_size - suffix_len
        }
    } else {
        match parts[0].parse::<u64>() {
            Ok(n) => n,
            Err(_) => return RangeResult::Invalid,
        }
    };

    let end = if parts[1].is_empty() || parts[0].is_empty() {
        total_size - 1
    } else {
        match parts[1].parse::<u64>() {
            Ok(n) => n.min(total_size - 1),
            Err(_) => return RangeResult::Invalid,
        }
    };

    if start > end || start >= total_size {
        return RangeResult::Invalid;
    }

    RangeResult::Partial { start, end }
}

fn mime_type_from_media(media: &Media) -> String {
    match media {
        Media::Document(d) => d.mime_type().unwrap_or("application/octet-stream").to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

pub async fn start_server(state: Arc<TelegramState>, port: u16) -> std::io::Result<actix_web::dev::Server> {
    let state_data = web::Data::new(state);

    log::info!("Starting Streaming Server on port {}", port);

    let server = HttpServer::new(move || {
        App::new()
            .wrap(Cors::permissive())
            .app_data(state_data.clone())
            .service(stream_media)
    })
    .bind(("127.0.0.1", port))?
    .run(); // Return Server, don't .await here — caller needs the handle first

    log::info!("Streaming Server started successfully on http://127.0.0.1:{}", port);

    Ok(server)
}
