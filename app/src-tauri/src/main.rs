// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Fix EGL_BAD_ALLOC on Linux distros (especially Arch) where the AppImage's
    // bundled Mesa conflicts with the host's GPU driver stack.
    // This must be set BEFORE tauri::Builder initializes the WebKitGTK WebView.
    // The cfg gate ensures this is completely inert on Windows and macOS builds.
    #[cfg(target_os = "linux")]
    {
        // Only set if the user hasn't explicitly overridden it
        if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    app_lib::run()
}
