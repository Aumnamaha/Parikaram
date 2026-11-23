#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Space { pub id: String, pub name: String, pub icon: String, pub color: String }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TabInfo { pub id: String, pub space_id: String, pub title: String, pub url: String, pub pinned: bool, pub is_active: bool, pub is_loading: bool }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ViewportBounds { pub x: f64, pub y: f64, pub width: f64, pub height: f64 }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BrowserSnapshot {
    pub spaces: Vec<Space>,
    pub active_space_id: String,
    pub tabs: Vec<TabInfo>,
    pub active_tab_id: Option<String>,
    pub split_tab_id: Option<String>,
    pub viewport: ViewportBounds,
    pub overlay_hidden: bool,
}

#[allow(dead_code)]
pub fn normalize_input_to_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "about:blank" { return "https://example.com".to_string(); }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") || trimmed.starts_with("about:") {
        return trimmed.to_string();
    }
    if !trimmed.contains(' ') && trimmed.contains('.') {
        return format!("https://{}", trimmed);
    }
    let encoded = urlencoding::encode(trimmed);
    format!("https://duckduckgo.com/?q={}", encoded)
}

#[allow(dead_code)]
pub fn compute_pane_rects(viewport: &ViewportBounds, has_split: bool) -> (ViewportBounds, Option<ViewportBounds>) {
    if !has_split || viewport.width <= 0.0 || viewport.height <= 0.0 {
        return (viewport.clone(), None);
    }
    let gap = 4.0;
    let left_width = (viewport.width - gap) / 2.0;
    let right_x = viewport.x + left_width + gap;
    let left = ViewportBounds { x: viewport.x, y: viewport.y, width: left_width.max(0.0), height: viewport.height };
    let right = Some(ViewportBounds { x: right_x, y: viewport.y, width: (viewport.width - gap - left_width).max(0.0), height: viewport.height });
    (left, right)
}

pub struct BrowserInner {
    pub spaces: Vec<Space>, pub active_space_id: String, pub tabs: Vec<TabInfo>,
    pub active_tab_id: Option<String>, pub split_tab_id: Option<String>,
    pub viewport: ViewportBounds, pub overlay_hidden: bool,
}

impl Default for BrowserInner {
    fn default() -> Self {
        let personal = Space { id: "space-personal".to_string(), name: "Personal".to_string(), icon: "folder".to_string(), color: "#6366f1".to_string() };
        let sid = personal.id.clone();
        let welcome_tab = TabInfo { id: uuid::Uuid::new_v4().to_string(), space_id: sid.clone(), title: "Welcome to Parikaram".to_string(), url: "https://example.com".to_string(), pinned: false, is_active: true, is_loading: false };
        Self { spaces: vec![personal], active_space_id: sid, tabs: vec![welcome_tab], active_tab_id: Some(uuid::Uuid::new_v4().to_string()), split_tab_id: None, viewport: ViewportBounds { x: 0.0, y: 0.0, width: 1360.0, height: 860.0 }, overlay_hidden: false }
    }
}

#[derive(Default)]
pub struct BrowserState(pub Mutex<BrowserInner>);

impl BrowserState {
    pub fn snapshot(&self) -> BrowserSnapshot {
        let inner = self.0.lock().unwrap();
        BrowserSnapshot {
            spaces: inner.spaces.clone(),
            active_space_id: inner.active_space_id.clone(),
            tabs: inner.tabs.clone(),
            active_tab_id: inner.active_tab_id.clone(),
            split_tab_id: inner.split_tab_id.clone(),
            viewport: inner.viewport.clone(),
            overlay_hidden: inner.overlay_hidden,
        }
    }
}

fn persist_workspace(store: &tauri::State<'_, crate::store::StoreState>, state: &BrowserState) -> Result<(), String> {
    let tabs_json = serde_json::to_string(&state.0.lock().unwrap().tabs).map_err(|e| e.to_string())?;
    store.sync_workspace_snapshot("space-personal", &tabs_json)?;
    Ok(())
}

#[cfg(desktop)]
pub(crate) fn sync_native_webviews(app: &AppHandle, snap: &BrowserSnapshot) {
    use tauri::webview::WebviewBuilder;
    use tauri::{LogicalPosition, LogicalSize, Rect, WebviewUrl};

    let Some(window) = app.get_window("main") else { return; };
    let (primary_rect, split_rect) = compute_pane_rects(&snap.viewport, snap.split_tab_id.is_some());

    // Build shield init script for child webviews
    let shield_script = crate::adblock::AdblockInner::build_shield_init_script(true);

    let valid_ids: std::collections::HashSet<String> = snap.tabs.iter().map(|t| t.id.clone()).collect();

    // app.webviews() returns (String label, Webview) tuples
    let mut existing_labels: Vec<String> = Vec::new();
    for (label, _) in app.webviews() {
        existing_labels.push(label.to_string());
    }

    // Close orphaned tab-<id> webviews not in snap.tabs
    for label in &existing_labels {
        if let Some(stripped) = label.strip_prefix("tab-") {
            if !valid_ids.contains(stripped) {
                let _ = app.get_webview(label).map(|wv| wv.close());
            }
        }
    }

    // Determine which tabs should be visible
    let mut visible_tab_ids: Vec<String> = Vec::new();
    if !snap.overlay_hidden && snap.viewport.width > 10.0 && snap.viewport.height > 10.0 {
        if let Some(ref aid) = snap.active_tab_id {
            visible_tab_ids.push(aid.clone());
        }
        if let Some(ref sid) = snap.split_tab_id {
            visible_tab_ids.push(sid.clone());
        }
    }

    // Show / position active tab at primary rect
    if let Some(ref aid) = snap.active_tab_id {
        let label = format!("tab-{}", aid);
        if valid_ids.contains(aid) && !snap.overlay_hidden && snap.viewport.width > 10.0 && snap.viewport.height > 10.0 {
            if let Some(wv) = app.get_webview(&label) {
                let _ = wv.set_bounds(Rect { position: LogicalPosition::new(primary_rect.x, primary_rect.y).into(), size: LogicalSize::new(primary_rect.width, primary_rect.height).into() });
                let _ = wv.show();
            } else if let Some(tab) = snap.tabs.iter().find(|t| t.id == *aid) {
                let parsed_url: tauri::Url = tab.url.parse().unwrap_or_else(|_| "https://example.com".parse().unwrap());
                let _ = window.add_child(WebviewBuilder::new(&label, WebviewUrl::External(parsed_url)).auto_resize().initialization_script(&shield_script), LogicalPosition::new(primary_rect.x, primary_rect.y), LogicalSize::new(primary_rect.width, primary_rect.height));
            }
        } else {
            if let Some(wv) = app.get_webview(&format!("tab-{}", aid)) { let _ = wv.hide(); }
        }
    }

    // Show / position split tab at secondary rect
    if let Some(ref sid) = snap.split_tab_id {
        if valid_ids.contains(sid) && !snap.overlay_hidden && snap.viewport.width > 10.0 && snap.viewport.height > 10.0 {
            if let Some(wv) = app.get_webview(&format!("tab-{}", sid)) {
                if let Some(ref rr) = split_rect {
                    let _ = wv.set_bounds(Rect { position: LogicalPosition::new(rr.x, rr.y).into(), size: LogicalSize::new(rr.width, rr.height).into() });
                }
                let _ = wv.show();
            } else if let Some(tab) = snap.tabs.iter().find(|t| t.id == *sid) {
                if let Some(ref rr) = split_rect {
                    let parsed_url: tauri::Url = tab.url.parse().unwrap_or_else(|_| "https://example.com".parse().unwrap());
                    let _ = window.add_child(WebviewBuilder::new(&format!("tab-{}", sid), WebviewUrl::External(parsed_url)).auto_resize().initialization_script(&shield_script), LogicalPosition::new(rr.x, rr.y), LogicalSize::new(rr.width, rr.height));
                }
            }
        } else {
            if let Some(wv) = app.get_webview(&format!("tab-{}", sid)) { let _ = wv.hide(); }
        }
    }

    // Hide all other visible tab webviews
    for tab in &snap.tabs {
        if !visible_tab_ids.contains(&tab.id) || snap.overlay_hidden {
            let label = format!("tab-{}", tab.id);
            if let Some(wv) = app.get_webview(&label) { let _ = wv.hide(); }
        }
    }
}

#[cfg(not(desktop))]
fn sync_native_webviews(_app: &AppHandle, _snap: &BrowserSnapshot) {}

macro_rules! sync_and_snapshot {
    ($app:expr, $state:expr) => {{
        let snap = BrowserSnapshot {
            spaces: $state.0.lock().unwrap().spaces.clone(),
            active_space_id: $state.0.lock().unwrap().active_space_id.clone(),
            tabs: $state.0.lock().unwrap().tabs.clone(),
            active_tab_id: $state.0.lock().unwrap().active_tab_id.clone(),
            split_tab_id: $state.0.lock().unwrap().split_tab_id.clone(),
            viewport: $state.0.lock().unwrap().viewport.clone(),
            overlay_hidden: $state.0.lock().unwrap().overlay_hidden,
        };
        #[cfg(desktop)]
        sync_native_webviews($app, &snap);
        Ok(serde_json::to_value(snap).map_err(|e| e.to_string())?)
    }};
}

#[tauri::command]
pub async fn list_tabs(state: tauri::State<'_, BrowserState>) -> Result<serde_json::Value, String> {
    serde_json::to_value(&state.snapshot()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_space(app: AppHandle, store: tauri::State<'_, crate::store::StoreState>, state: tauri::State<'_, BrowserState>, name: String, icon: String, color: String) -> Result<serde_json::Value, String> {
    let sid = uuid::Uuid::new_v4().to_string();
    let space = Space { id: sid.clone(), name, icon, color };
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.spaces.push(space);
    drop(inner);
    persist_workspace(&store, &state).ok();
    sync_and_snapshot!(&app, &state)
}

#[tauri::command]
pub async fn switch_space(app: AppHandle, store: tauri::State<'_, crate::store::StoreState>, state: tauri::State<'_, BrowserState>, space_id: String) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.active_space_id = space_id.clone();
    for t in &mut inner.tabs { if t.is_active && t.space_id != space_id { t.is_active = false } }
    for t in &mut inner.tabs {
        if t.space_id == space_id && !t.pinned { t.is_active = true; inner.active_tab_id = Some(t.id.clone()); break }
    }
    drop(inner);
    persist_workspace(&store, &state).ok();
    sync_and_snapshot!(&app, &state)
}

#[tauri::command]
pub async fn create_tab(app: AppHandle, store: tauri::State<'_, crate::store::StoreState>, state: tauri::State<'_, BrowserState>, adblock: tauri::State<'_, crate::adblock::AdblockState>, url: Option<String>, pinned: Option<bool>) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    for t in &mut inner.tabs { if t.is_active { t.is_active = false } }
    let tid = uuid::Uuid::new_v4().to_string();
    let mut target_url = url.unwrap_or_else(|| normalize_input_to_url(""));
    // Block ad/tracker URLs on tab creation
    {
        let mut ab = adblock.0.lock().map_err(|e| e.to_string())?;
        if ab.check_url(&target_url, &target_url, "document", None) {
            target_url = "https://example.com".to_string();
        }
    }
    let new_tab = TabInfo { id: tid.clone(), space_id: inner.active_space_id.clone(), title: "New Tab".to_string(), url: target_url, pinned: pinned.unwrap_or(false), is_active: true, is_loading: false };
    inner.tabs.push(new_tab);
    inner.active_tab_id = Some(tid.clone());
    drop(inner);
    persist_workspace(&store, &state).ok();
    sync_and_snapshot!(&app, &state)
}

#[tauri::command]
pub async fn activate_tab(app: AppHandle, state: tauri::State<'_, BrowserState>, tab_id: String) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    for t in &mut inner.tabs { if t.is_active && t.id != tab_id { t.is_active = false } }
    if let Some(t) = inner.tabs.iter_mut().find(|t| t.id == tab_id) { t.is_active = true; inner.active_tab_id = Some(tab_id.clone()); }
    drop(inner);
    sync_and_snapshot!(&app, &state)
}

#[tauri::command]
pub async fn close_tab(app: AppHandle, store: tauri::State<'_, crate::store::StoreState>, state: tauri::State<'_, BrowserState>, tab_id: String) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(idx) = inner.tabs.iter().position(|t| t.id == tab_id) {
        let was_active = inner.tabs[idx].is_active;
        inner.tabs.remove(idx);
        if was_active {
            let mut candidates: Vec<String> = Vec::new();
            for t in &inner.tabs {
                if t.space_id == inner.active_space_id && !t.pinned { candidates.push(t.id.clone()); break }
            }
            if candidates.is_empty() {
                if let Some(first) = inner.tabs.first() { candidates.push(first.id.clone()); }
            }
            if !candidates.is_empty() {
                for t in &mut inner.tabs { t.is_active = false; }
                if let Some(ref cid) = candidates.first() {
                    if let Some(t) = inner.tabs.iter_mut().find(|t| t.id == **cid) { t.is_active = true; }
                    inner.active_tab_id = Some((*cid).clone());
                }
            } else { inner.active_tab_id = None; }
        }
    }
    drop(inner);
    persist_workspace(&store, &state).ok();
    sync_and_snapshot!(&app, &state)
}

#[tauri::command]
pub async fn navigate_tab(app: AppHandle, store: tauri::State<'_, crate::store::StoreState>, state: tauri::State<'_, BrowserState>, adblock: tauri::State<'_, crate::adblock::AdblockState>, tab_id: String, input: String) -> Result<serde_json::Value, String> {
    let resolved_url = normalize_input_to_url(&input);
    // Block ad/tracker URLs on navigation
    let final_url = {
        let mut ab = adblock.0.lock().map_err(|e| e.to_string())?;
        if ab.check_url(&resolved_url, &resolved_url, "document", Some(&tab_id)) {
            "https://example.com".to_string()
        } else {
            resolved_url.clone()
        }
    };
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(t) = inner.tabs.iter_mut().find(|t| t.id == tab_id) {
        t.url = final_url.clone();
        t.is_loading = true;
        t.title = "Loading...".to_string();
    }
    drop(inner);

    // Record history in store
    let _ = store.record_history_internal("default", &final_url, "Loading...");
    persist_workspace(&store, &state).ok();

    #[cfg(desktop)]
    {
        let new_url: tauri::Url = normalize_input_to_url(&input).parse().unwrap_or_else(|_| "https://example.com".parse().unwrap());
        if let Some(wv) = app.get_webview(&format!("tab-{}", tab_id)) {
            let _ = wv.navigate(new_url);
        }
    }

    sync_and_snapshot!(&app, &state)
}

#[tauri::command]
pub async fn set_split_tabs(app: AppHandle, state: tauri::State<'_, BrowserState>, secondary_tab_id: Option<String>) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(ref sid) = secondary_tab_id { if !inner.tabs.iter().any(|t| t.id == *sid) { return Err("Tab not found".to_string()); } }
    inner.split_tab_id = secondary_tab_id;
    drop(inner);
    sync_and_snapshot!(&app, &state)
}

#[tauri::command]
pub async fn set_viewport_bounds(app: AppHandle, state: tauri::State<'_, BrowserState>, bounds: ViewportBounds) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.viewport = bounds.clone();
    drop(inner);
    sync_and_snapshot!(&app, &state)
}

#[tauri::command]
pub async fn set_overlay_hidden(app: AppHandle, state: tauri::State<'_, BrowserState>, hidden: bool) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.overlay_hidden = hidden;
    drop(inner);
    sync_and_snapshot!(&app, &state)
}

#[tauri::command]
pub async fn reload_tab(app: AppHandle, state: tauri::State<'_, BrowserState>, tab_id: String) -> Result<serde_json::Value, String> {
    #[cfg(desktop)]
    if let Some(wv) = app.get_webview(&format!("tab-{}", tab_id)) { let _ = wv.reload(); }
    Ok(serde_json::to_value(state.snapshot()).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn go_back_tab(app: AppHandle, state: tauri::State<'_, BrowserState>, tab_id: String) -> Result<serde_json::Value, String> {
    #[cfg(desktop)]
    if let Some(wv) = app.get_webview(&format!("tab-{}", tab_id)) { let _ = wv.eval("history.back()"); }
    Ok(serde_json::to_value(state.snapshot()).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn go_forward_tab(app: AppHandle, state: tauri::State<'_, BrowserState>, tab_id: String) -> Result<serde_json::Value, String> {
    #[cfg(desktop)]
    if let Some(wv) = app.get_webview(&format!("tab-{}", tab_id)) { let _ = wv.eval("history.forward()"); }
    Ok(serde_json::to_value(state.snapshot()).map_err(|e| e.to_string())?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_url_schemes() {
        assert_eq!(normalize_input_to_url("https://rust-lang.org"), "https://rust-lang.org");
        assert_eq!(normalize_input_to_url("http://localhost:1420"), "http://localhost:1420");
    }

    #[test]
    fn test_normalize_bare_domain() {
        let result = normalize_input_to_url("github.com/zephium-browser/Zephium");
        assert!(result.starts_with("https://"));
        assert_eq!(result, "https://github.com/zephium-browser/Zephium");
    }

    #[test]
    fn test_normalize_search_query() {
        let result = normalize_input_to_url("tauri v2 webview");
        assert!(result.starts_with("https://duckduckgo.com/?q="));
        assert!(result.contains("%20"));
    }

    #[test]
    fn test_compute_pane_rects_single_and_split() {
        let vp = ViewportBounds { x: 0.0, y: 0.0, width: 1360.0, height: 860.0 };
        let (left, right) = compute_pane_rects(&vp, false);
        assert_eq!(left, vp);
        assert!(right.is_none());
        let (left_s, right_s) = compute_pane_rects(&vp, true);
        assert!((left_s.width - 678.0).abs() < f64::EPSILON);
        assert_eq!(left_s.x, 0.0);
        let right = right_s.unwrap();
        assert_eq!(right.x, 682.0);
    }

    #[test]
    fn test_tab_lifecycle_create_activate_close() {
        let state = BrowserState::default();
        let snap = state.snapshot();
        assert_eq!(snap.tabs.len(), 1);
        assert!(snap.active_tab_id.is_some());
    }

    #[test]
    fn test_space_switching_updates_active_tab() {
        let state = BrowserState::default();
        let snap = state.snapshot();
        assert_eq!(snap.spaces.len(), 1);
        assert_eq!(snap.active_space_id, "space-personal");
    }

    #[test]
    fn test_overlay_hidden_state() {
        let state = BrowserState::default();
        assert!(!state.snapshot().overlay_hidden);
    }

    #[test]
    fn test_pinned_tab_creation() {
        let state = BrowserState::default();
        let snap = state.snapshot();
        // Default welcome tab should not be pinned
        assert!(!snap.tabs[0].pinned);
    }
}
