use std::net::TcpStream;
use std::time::Duration;

/// Network check optimized for high-latency connections (e.g. China VPN)
/// 
/// Tries multiple Telegram DCs instead of just DC2, since VPN routing
/// from China may have better paths to certain data centers.
/// Uses an 8-second timeout to accommodate VPN latency.
#[tauri::command]
pub async fn cmd_is_network_available() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| {
        // Try all 5 Telegram DCs — VPN routing from China varies
        let dc_endpoints = [
            "149.154.175.53:443",   // DC1
            "149.154.167.50:443",   // DC2
            "149.154.175.100:443",  // DC3
            "149.154.167.91:443",   // DC4
            "91.108.56.130:443",    // DC5
        ];

        for endpoint in &dc_endpoints {
            if let Ok(addr) = endpoint.parse() {
                if TcpStream::connect_timeout(
                    &addr,
                    Duration::from_secs(8),
                ).is_ok() {
                    return Ok(true);
                }
            }
        }

        Ok(false)
    })
    .await
    .map_err(|e| e.to_string())?
}
