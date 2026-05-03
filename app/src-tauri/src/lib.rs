pub mod models;

pub mod commands;
pub mod bandwidth;

use tauri::Manager;
use tokio::sync::Mutex;
use std::sync::Arc;
use std::collections::HashMap;
use commands::TelegramState;

pub mod server;

/// Holds the Actix server handle so it can be stopped on app exit.
/// Wrapped in std::sync::Mutex because RunEvent::Exit is a synchronous callback.
pub struct ActixServerHandle(pub Arc<std::sync::Mutex<Option<actix_web::dev::ServerHandle>>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    // Shared handle that lib.rs setup closure writes into, and the Actix thread reads from.
    let server_handle: Arc<std::sync::Mutex<Option<actix_web::dev::ServerHandle>>> =
        Arc::new(std::sync::Mutex::new(None));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(move |app| {
            app.manage(TelegramState {
                client: Arc::new(Mutex::new(None)),
                login_token: Arc::new(Mutex::new(None)),
                password_token: Arc::new(Mutex::new(None)),
                api_id: Arc::new(Mutex::new(None)),
                runner_shutdown: Arc::new(std::sync::Mutex::new(None)),
                runner_count: Arc::new(std::sync::atomic::AtomicU32::new(0)),
                peer_cache: Arc::new(Mutex::new(HashMap::new())),
                proxy_url: Arc::new(Mutex::new(None)),
            });
            app.manage(bandwidth::BandwidthManager::new(app.handle()));

            // Register the Actix server handle as managed state so RunEvent::Exit can access it
            app.manage(ActixServerHandle(server_handle.clone()));

            // Start Streaming Server on dedicated thread (Actix needs its own runtime)
            let state = Arc::new(app.state::<TelegramState>().inner().clone());
            let handle_for_thread = server_handle.clone();
            std::thread::spawn(move || {
                let sys = actix_rt::System::new();
                sys.block_on(async move {
                    match server::start_server(state, server::STREAMING_PORT).await {
                        Ok(server) => {
                            // Store the handle BEFORE awaiting so RunEvent::Exit can stop it
                            *handle_for_thread.lock().unwrap() = Some(server.handle());
                            // Now drive the server to completion
                            server.await.ok();
                        }
                        Err(e) => log::error!("Streaming server failed: {}", e),
                    }
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::cmd_auth_request_code,
            commands::cmd_auth_sign_in,
            commands::cmd_auth_check_password,
            commands::cmd_get_files,
            commands::cmd_upload_file,
            commands::cmd_connect,
            commands::cmd_log,
            commands::cmd_delete_file,
            commands::cmd_download_file,
            commands::cmd_move_files,
            commands::cmd_create_folder,
            commands::cmd_delete_folder,
            commands::cmd_get_bandwidth,
            commands::cmd_get_preview,
            commands::cmd_logout,
            commands::cmd_scan_folders,
            commands::cmd_search_global,
            commands::cmd_check_connection,
            commands::cmd_is_network_available,
            commands::cmd_clean_cache,
            commands::cmd_get_thumbnail,
            commands::cmd_set_proxy,
            commands::cmd_get_stream_port,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            // 1. Shutdown the grammers network runner
            // Use try_lock (non-blocking) — we cannot .await in a sync callback
            let state = app_handle.state::<TelegramState>();
            if let Ok(mut guard) = state.runner_shutdown.try_lock() {
                if let Some(tx) = guard.take() {
                    log::info!("RunEvent::Exit: signaling grammers runner shutdown");
                    let _ = tx.send(());
                }
            }

            // 2. Stop the Actix streaming server gracefully
            let actix_handle = app_handle.state::<ActixServerHandle>();
            if let Ok(mut guard) = actix_handle.0.try_lock() {
                if let Some(handle) = guard.take() {
                    log::info!("RunEvent::Exit: stopping Actix streaming server");
                    let _ = handle.stop(true); // graceful=true: signals server to drain and stop
                }
            };
        }
    });
}
