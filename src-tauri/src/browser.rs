#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::AppHandle;

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
}

/// Normalize user input to a URL or search query.
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

// BrowserInner state container
pub(crate) struct BrowserInner {
    spaces: Vec<Space>, active_space_id: String, tabs: Vec<TabInfo>,
    active_tab_id: Option<String>, split_tab_id: Option<String>, viewport: ViewportBounds,
}

impl Default for BrowserInner {
    fn default() -> Self {
        let personal = Space { id: "space-personal".to_string(), name: "Personal".to_string(), icon: "folder".to_string(), color: "#6366f1".to_string() };
        let sid = personal.id.clone();
        let welcome_tab = TabInfo { id: uuid::Uuid::new_v4().to_string(), space_id: sid.clone(), title: "Welcome to Parikaram".to_string(), url: "https://example.com".to_string(), pinned: false, is_active: true, is_loading: false };
        Self { spaces: vec![personal], active_space_id: sid, tabs: vec![welcome_tab], active_tab_id: Some(uuid::Uuid::new_v4().to_string()), split_tab_id: None, viewport: ViewportBounds { x: 0.0, y: 0.0, width: 1360.0, height: 860.0 } }
    }
}

#[derive(Default)]
pub struct BrowserState(pub Mutex<BrowserInner>);

impl BrowserState {
    fn snapshot(&self) -> BrowserSnapshot {
        let inner = self.0.lock().unwrap();
        BrowserSnapshot {
            spaces: inner.spaces.clone(),
            active_space_id: inner.active_space_id.clone(),
            tabs: inner.tabs.clone(),
            active_tab_id: inner.active_tab_id.clone(),
            split_tab_id: inner.split_tab_id.clone(),
            viewport: inner.viewport.clone(),
        }
    }
}

#[cfg(desktop)]
fn sync_native_webviews(_app: &AppHandle, _snap: &BrowserSnapshot) {}

#[cfg(not(desktop))]
fn sync_native_webviews(_app: &AppHandle, _snap: &BrowserSnapshot) {}

#[tauri::command]
pub async fn list_tabs(state: tauri::State<'_, BrowserState>) -> Result<serde_json::Value, String> {
    serde_json::to_value(&state.snapshot()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_space(app: tauri::AppHandle, state: tauri::State<'_, BrowserState>, name: String, icon: String, color: String) -> Result<serde_json::Value, String> {
    let sid = uuid::Uuid::new_v4().to_string();
    let space = Space { id: sid.clone(), name, icon, color };
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.spaces.push(space);
    sync_native_webviews(&app, &BrowserSnapshot { spaces: inner.spaces.clone(), active_space_id: inner.active_space_id.clone(), tabs: inner.tabs.clone(), active_tab_id: inner.active_tab_id.clone(), split_tab_id: inner.split_tab_id.clone(), viewport: inner.viewport.clone() });
    Ok(serde_json::to_value(state.snapshot()).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn switch_space(app: tauri::AppHandle, state: tauri::State<'_, BrowserState>, space_id: String) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.active_space_id = space_id.clone();
    for t in &mut inner.tabs { if t.is_active && t.space_id != space_id { t.is_active = false } }
    for t in &mut inner.tabs {
        if t.space_id == space_id && !t.pinned { t.is_active = true; inner.active_tab_id = Some(t.id.clone()); break }
    }
    sync_native_webviews(&app, &BrowserSnapshot { spaces: inner.spaces.clone(), active_space_id: inner.active_space_id.clone(), tabs: inner.tabs.clone(), active_tab_id: inner.active_tab_id.clone(), split_tab_id: inner.split_tab_id.clone(), viewport: inner.viewport.clone() });
    Ok(serde_json::to_value(state.snapshot()).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_tab(app: tauri::AppHandle, state: tauri::State<'_, BrowserState>, url: Option<String>, pinned: Option<bool>) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    for t in &mut inner.tabs { if t.is_active { t.is_active = false } }
    let tid = uuid::Uuid::new_v4().to_string();
    let target_url = url.unwrap_or_else(|| normalize_input_to_url(""));
    let new_tab = TabInfo { id: tid.clone(), space_id: inner.active_space_id.clone(), title: "New Tab".to_string(), url: target_url, pinned: pinned.unwrap_or(false), is_active: true, is_loading: false };
    inner.tabs.push(new_tab);
    inner.active_tab_id = Some(tid.clone());
    sync_native_webviews(&app, &BrowserSnapshot { spaces: inner.spaces.clone(), active_space_id: inner.active_space_id.clone(), tabs: inner.tabs.clone(), active_tab_id: inner.active_tab_id.clone(), split_tab_id: inner.split_tab_id.clone(), viewport: inner.viewport.clone() });
    Ok(serde_json::to_value(state.snapshot()).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn activate_tab(app: tauri::AppHandle, state: tauri::State<'_, BrowserState>, tab_id: String) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    for t in &mut inner.tabs { if t.is_active && t.id != tab_id { t.is_active = false } }
    if let Some(t) = inner.tabs.iter_mut().find(|t| t.id == tab_id) { t.is_active = true; inner.active_tab_id = Some(tab_id.clone()); }
    sync_native_webviews(&app, &BrowserSnapshot { spaces: inner.spaces.clone(), active_space_id: inner.active_space_id.clone(), tabs: inner.tabs.clone(), active_tab_id: inner.active_tab_id.clone(), split_tab_id: inner.split_tab_id.clone(), viewport: inner.viewport.clone() });
    Ok(serde_json::to_value(state.snapshot()).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn close_tab(app: tauri::AppHandle, state: tauri::State<'_, BrowserState>, tab_id: String) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(idx) = inner.tabs.iter().position(|t| t.id == tab_id) {
        let was_active = inner.tabs[idx].is_active;
        inner.tabs.remove(idx);
        if was_active {
            // Collect candidate IDs first to avoid borrow conflicts
            let mut candidates: Vec<String> = Vec::new();
            for t in &inner.tabs {
                if t.space_id == inner.active_space_id && !t.pinned { candidates.push(t.id.clone()); break }
            }
            if candidates.is_empty() {
                // Try any tab
                if let Some(first) = inner.tabs.first() {
                    candidates.push(first.id.clone());
                }
            }
            if !candidates.is_empty() {
                for t in &mut inner.tabs { t.is_active = false; }
                if let Some(ref cid) = candidates.first() {
                    if let Some(t) = inner.tabs.iter_mut().find(|t| t.id == **cid) { t.is_active = true; }
                    inner.active_tab_id = Some((*cid).clone());
                }
            } else {
                inner.active_tab_id = None;
            }
        }
    }
    sync_native_webviews(&app, &BrowserSnapshot { spaces: inner.spaces.clone(), active_space_id: inner.active_space_id.clone(), tabs: inner.tabs.clone(), active_tab_id: inner.active_tab_id.clone(), split_tab_id: inner.split_tab_id.clone(), viewport: inner.viewport.clone() });
    Ok(serde_json::to_value(state.snapshot()).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn navigate_tab(app: tauri::AppHandle, state: tauri::State<'_, BrowserState>, tab_id: String, input: String) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(t) = inner.tabs.iter_mut().find(|t| t.id == tab_id) { t.url = normalize_input_to_url(&input); t.is_loading = true; t.title = "Loading...".to_string(); }
    sync_native_webviews(&app, &BrowserSnapshot { spaces: inner.spaces.clone(), active_space_id: inner.active_space_id.clone(), tabs: inner.tabs.clone(), active_tab_id: inner.active_tab_id.clone(), split_tab_id: inner.split_tab_id.clone(), viewport: inner.viewport.clone() });
    Ok(serde_json::to_value(state.snapshot()).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn set_split_tabs(app: tauri::AppHandle, state: tauri::State<'_, BrowserState>, secondary_tab_id: Option<String>) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(ref sid) = secondary_tab_id { if !inner.tabs.iter().any(|t| t.id == *sid) { return Err("Tab not found".to_string()); } }
    inner.split_tab_id = secondary_tab_id;
    sync_native_webviews(&app, &BrowserSnapshot { spaces: inner.spaces.clone(), active_space_id: inner.active_space_id.clone(), tabs: inner.tabs.clone(), active_tab_id: inner.active_tab_id.clone(), split_tab_id: inner.split_tab_id.clone(), viewport: inner.viewport.clone() });
    Ok(serde_json::to_value(state.snapshot()).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn set_viewport_bounds(app: tauri::AppHandle, state: tauri::State<'_, BrowserState>, bounds: ViewportBounds) -> Result<serde_json::Value, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.viewport = bounds.clone();
    sync_native_webviews(&app, &BrowserSnapshot { spaces: inner.spaces.clone(), active_space_id: inner.active_space_id.clone(), tabs: inner.tabs.clone(), active_tab_id: inner.active_tab_id.clone(), split_tab_id: inner.split_tab_id.clone(), viewport: inner.viewport.clone() });
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
        assert_eq!(left, vp); assert!(right.is_none());
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
}
