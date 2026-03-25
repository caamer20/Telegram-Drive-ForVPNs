use std::future::Future;
use tokio::time::{sleep, Duration};

/// Determines if an error is transient and worth retrying
pub fn is_transient_error(err: &str) -> bool {
    let transient_keywords = [
        "timeout", "timed out", "connection", "reset", "eof",
        "broken pipe", "network", "socket", "disconnected",
        "temporarily unavailable", "try again",
    ];
    let lower = err.to_lowercase();
    transient_keywords.iter().any(|k| lower.contains(k))
}

/// Extracts FLOOD_WAIT duration from an error string, if present
pub fn parse_flood_wait(err: &str) -> Option<u64> {
    if !err.contains("FLOOD_WAIT") {
        return None;
    }
    // Expected format: ... (value: 1234)
    if let Some(start) = err.find("(value: ") {
        let rest = &err[start + 8..];
        if let Some(end) = rest.find(')') {
            if let Ok(seconds) = rest[..end].parse::<u64>() {
                return Some(seconds);
            }
        }
    }
    // Fallback: assume 60s if we know it's a flood wait but can't parse
    Some(60)
}

/// Retry an async operation with exponential backoff.
/// 
/// Designed for high-latency VPN connections where transient failures are common.
/// - Retries up to `max_retries` times on transient network errors
/// - Auto-sleeps on FLOOD_WAIT errors (up to a cap)
/// - Uses exponential backoff: base_delay_ms * 2^attempt
pub async fn with_retry<F, Fut, T>(
    operation: F,
    max_retries: u32,
    base_delay_ms: u64,
) -> Result<T, String>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
    let mut last_error = String::new();

    for attempt in 0..=max_retries {
        match operation().await {
            Ok(val) => return Ok(val),
            Err(e) => {
                last_error = e.clone();

                // Check for FLOOD_WAIT — always respect it
                if let Some(wait_secs) = parse_flood_wait(&e) {
                    let capped = wait_secs.min(120); // Cap at 2 minutes
                    log::warn!(
                        "FLOOD_WAIT detected ({}s). Sleeping {}s before retry...",
                        wait_secs, capped
                    );
                    sleep(Duration::from_secs(capped)).await;
                    continue;
                }

                // Only retry transient errors
                if attempt < max_retries && is_transient_error(&e) {
                    let delay = base_delay_ms * 2u64.pow(attempt);
                    log::warn!(
                        "Transient error (attempt {}/{}): {}. Retrying in {}ms...",
                        attempt + 1, max_retries + 1, e, delay
                    );
                    sleep(Duration::from_millis(delay)).await;
                    continue;
                }

                // Non-transient error or out of retries
                break;
            }
        }
    }

    Err(last_error)
}
