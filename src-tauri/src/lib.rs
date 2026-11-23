#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod browser;
pub mod store;

use serde_json::Value;
use tauri::Manager;

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
            "sqlite_storage": true,
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
        .setup(|app| {
            let data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("parikaram"));
            std::fs::create_dir_all(&data_dir).ok();
            let store = store::StoreState::open(data_dir.join("parikaram.sqlite")).map_err(|e| e.to_string())?;

            // Hydrate BrowserState from persisted spaces/tabs for active profile
            let (spaces_json, tabs_json) = store.load_workspace_snapshot().unwrap_or((Vec::new(), Vec::new()));
            let mut browser_inner = browser::BrowserInner {
                spaces: Vec::new(),
                active_space_id: "space-personal".to_string(),
                tabs: Vec::new(),
                active_tab_id: None,
                split_tab_id: None,
                viewport: browser::ViewportBounds { x: 0.0, y: 0.0, width: 1360.0, height: 860.0 },
                overlay_hidden: false,
            };

            // Load persisted spaces
            for s in &spaces_json {
                browser_inner.spaces.push(browser::Space {
                    id: s["id"].as_str().unwrap_or("").to_string(),
                    name: s["name"].as_str().unwrap_or("").to_string(),
                    icon: s["icon"].as_str().unwrap_or("folder").to_string(),
                    color: s["color"].as_str().unwrap_or("#6366f1").to_string(),
                });
            }

            // Load persisted tabs (unpinned only, from DB)
            for t in &tabs_json {
                browser_inner.tabs.push(browser::TabInfo {
                    id: uuid::Uuid::new_v4().to_string(),
                    space_id: "space-personal".to_string(),
                    title: t["title"].as_str().unwrap_or("Untitled").to_string(),
                    url: t["url"].as_str().unwrap_or("https://example.com").to_string(),
                    pinned: false,
                    is_active: false,
                    is_loading: false,
                });
            }

            // Reactivate first unpinned tab or create welcome tab if none
            if browser_inner.tabs.is_empty() {
                let sid = "space-personal".to_string();
                let tid = uuid::Uuid::new_v4().to_string();
                browser_inner.spaces.push(browser::Space { id: sid.clone(), name: "Personal".to_string(), icon: "folder".to_string(), color: "#6366f1".to_string() });
                browser_inner.tabs.push(browser::TabInfo { id: tid.clone(), space_id: sid, title: "Welcome to Parikaram".to_string(), url: "https://example.com".to_string(), pinned: false, is_active: true, is_loading: false });
                browser_inner.active_tab_id = Some(tid);
            } else if let Some(t) = browser_inner.tabs.iter_mut().find(|t| !t.pinned) {
                t.is_active = true;
                browser_inner.active_tab_id = Some(t.id.clone());
            }

            let browser_state = browser::BrowserState(std::sync::Mutex::new(browser_inner));

            app.manage(store);
            app.manage(browser_state);
            Ok(())
        })
        .manage(browser::BrowserState(Default::default()))
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            // Browser commands
            browser::list_tabs,
            browser::create_space,
            browser::switch_space,
            browser::create_tab,
            browser::activate_tab,
            browser::close_tab,
            browser::navigate_tab,
            browser::set_split_tabs,
            browser::set_viewport_bounds,
            browser::set_overlay_hidden,
            browser::reload_tab,
            browser::go_back_tab,
            browser::go_forward_tab,
            // Store commands
            store::list_profiles,
            store::create_profile,
            store::switch_profile,
            store::record_history,
            store::search_history,
            store::clear_history,
            store::list_bookmarks,
            store::add_bookmark,
            store::remove_bookmark,
            store::list_notes,
            store::upsert_note,
            store::delete_note,
            store::list_tasks,
            store::upsert_task,
            store::toggle_task,
            store::delete_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
