use grammers_client::Client;
use grammers_client::types::Peer;
use tauri::State;
use crate::bandwidth::BandwidthManager;
use crate::TelegramState;

/// Resolve a folder/chat ID to a Telegram Peer.
/// 
/// Uses an in-memory cache to avoid iterating all dialogs on every operation.
/// On a high-latency VPN connection, iterating 100 dialogs at ~300ms each
/// would take 30s — the cache makes subsequent lookups instant.
pub async fn resolve_peer(client: &Client, folder_id: Option<i64>, state: &TelegramState) -> Result<Peer, String> {
    if let Some(fid) = folder_id {
        // Check cache first
        {
            let cache = state.peer_cache.lock().await;
            if let Some(cached_peer) = cache.get(&fid) {
                log::debug!("Peer cache HIT for folder {}", fid);
                return Ok(cached_peer.clone());
            }
        }

        log::debug!("Peer cache MISS for folder {}. Iterating dialogs...", fid);

        // Cache miss — iterate dialogs and populate cache
        let mut dialogs = client.iter_dialogs();
        while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
            let peer_id = match &dialog.peer {
                Peer::Channel(c) => Some(c.raw.id),
                Peer::User(u) => Some(u.raw.id()),
                _ => None,
            };

            if let Some(id) = peer_id {
                // Cache every peer we see for future lookups
                let mut cache = state.peer_cache.lock().await;
                cache.insert(id, dialog.peer.clone());

                if id == fid {
                    return Ok(dialog.peer.clone());
                }
            }
        }
        Err(format!("Folder/Chat {} not found", fid))
    } else {
        match client.get_me().await {
            Ok(me) => Ok(Peer::User(me)),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[tauri::command]
pub fn cmd_log(message: String) {
    log::info!("[FRONTEND] {}", message);
}

#[tauri::command]
pub fn cmd_get_bandwidth(bw_state: State<'_, BandwidthManager>) -> crate::bandwidth::BandwidthStats {
    bw_state.get_stats()
}

pub fn map_error(e: impl std::fmt::Display) -> String {
    let err_str = e.to_string();
    if err_str.contains("FLOOD_WAIT") {
        // Expected format: ... (value: 1234)
        if let Some(start) = err_str.find("(value: ") {
             let rest = &err_str[start + 8..];
             if let Some(end) = rest.find(')') {
                 if let Ok(seconds) = rest[..end].parse::<i64>() {
                     return format!("FLOOD_WAIT_{}", seconds);
                 }
             }
        }
        // Fallback if parsing fails but we know it's a flood wait
        return "FLOOD_WAIT_60".to_string();
    }
    err_str
}
