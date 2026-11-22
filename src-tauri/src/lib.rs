#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::Value;

#[tauri::command]
fn get_app_info() -> Value {
    let arch = std::env::consts::ARCH;
    let target_os = std::env::consts::OS;

    serde_json::json!({
        "app_name": env!("CARGO_PKG_NAME"),
        "version": env!("CARGO_PKG_VERSION"),
        "arch": arch,
        "target_os": target_os,
        "debug": cfg!(debug_assertions),
        "capabilities": {
            "desktop": true,
            "mobile_ios": true,
            "mobile_android": true,
            "sqlite_storage": false,
            "ad_blocking": false,
            "ai_sidebar": false,
            "spatial_canvas": false
        }
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_app_info])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
