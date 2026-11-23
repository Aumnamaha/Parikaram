//! Multi-provider AI streaming runtime with OS keychain storage.
//!
//! Providers: LM Studio (127.0.0.1:1234/v1), Ollama, OpenAI, Anthropic, Gemini, OpenRouter.

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri::State;
use tauri::AppHandle;

// ---------------------------------------------------------------------------
// Data structs
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AiProviderInfo {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub kind: String, // "openai" or "anthropic"
    pub requires_key: bool,
    pub has_key: bool,
    pub default_model: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatStreamRequest {
    pub request_id: String,
    pub provider_id: String,
    pub model: String,
    #[serde(default)]
    pub base_url_override: Option<String>,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub page_context: Option<String>,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
}

fn default_temperature() -> f32 { 0.7 }

#[derive(Clone, Debug, Serialize)]
pub struct AiStreamChunkEvent { pub request_id: String, pub delta: String }

#[derive(Clone, Debug, Serialize)]
pub struct AiStreamDoneEvent {
    pub request_id: String, pub full_text: String,
    pub provider_id: String, pub model: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct AiStreamErrorEvent { pub request_id: String, pub error: String }

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

pub struct AiInner {
    pub providers: Vec<AiProviderInfo>,
    cancellation_flags: HashMap<String, Arc<AtomicBool>>,
    pub use_memory_keyring: bool,
    memory_secrets: HashMap<String, String>,
}

impl Default for AiInner {
    fn default() -> Self {
        Self {
            providers: vec![
                AiProviderInfo { id: "lmstudio".into(), name: "LM Studio".into(), base_url: "http://127.0.0.1:1234/v1".into(), kind: "openai".into(), requires_key: false, has_key: false, default_model: "local-model".into() },
                AiProviderInfo { id: "ollama".into(), name: "Ollama".into(), base_url: "http://127.0.0.1:11434/v1".into(), kind: "openai".into(), requires_key: false, has_key: false, default_model: "llama3".into() },
                AiProviderInfo { id: "openai".into(), name: "OpenAI".into(), base_url: "https://api.openai.com/v1".into(), kind: "openai".into(), requires_key: true, has_key: false, default_model: "gpt-4o".into() },
                AiProviderInfo { id: "anthropic".into(), name: "Anthropic".into(), base_url: "https://api.anthropic.com/v1".into(), kind: "anthropic".into(), requires_key: true, has_key: false, default_model: "claude-sonnet-4-20250514".into() },
                AiProviderInfo { id: "gemini".into(), name: "Google Gemini".into(), base_url: "https://generativelanguage.googleapis.com/v1beta/openai".into(), kind: "openai".into(), requires_key: true, has_key: false, default_model: "gemini-2.0-flash".into() },
                AiProviderInfo { id: "openrouter".into(), name: "OpenRouter".into(), base_url: "https://openrouter.ai/api/v1".into(), kind: "openai".into(), requires_key: true, has_key: false, default_model: "anthropic/claude-sonnet-4-20250514".into() },
            ],
            cancellation_flags: HashMap::new(),
            use_memory_keyring: cfg!(test),
            memory_secrets: HashMap::new(),
        }
    }
}

/// Shared state for AI provider management and streaming.
#[allow(private_interfaces)]
pub struct AiState(pub std::sync::Mutex<AiInner>);

impl Default for AiState {
    fn default() -> Self { Self(std::sync::Mutex::new(AiInner::default())) }
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

/// Parse an SSE line and return the content delta, if any.
pub fn parse_sse_delta(provider_kind: &str, raw_line: &str) -> Option<String> {
    let line = raw_line.trim();
    if line.is_empty() || line.starts_with(':') || line == "data: [DONE]" { return None; }
    let json_line = if line.starts_with("data:") { line[5..].trim().to_string() } else { line.to_string() };
    if json_line.is_empty() { return None; }
    match provider_kind {
        "openai" => parse_openai_delta(&json_line),
        "anthropic" => parse_anthropic_delta(&json_line),
        _ => parse_openai_delta(&json_line),
    }
}

fn parse_openai_delta(json_line: &str) -> Option<String> {
    let value: serde_json::Value = match serde_json::from_str(json_line) { Ok(v) => v, Err(_) => return None };
    if let Some(content) = value.get("choices")?.get(0)?.get("delta")?.get("content").and_then(|v| v.as_str()) {
        if !content.is_empty() { return Some(content.to_string()); }
    }
    if let Some(content) = value.get("choices")?.get(0)?.get("message")?.get("content").and_then(|v| v.as_str()) {
        if !content.is_empty() { return Some(content.to_string()); }
    }
    None
}

fn parse_anthropic_delta(json_line: &str) -> Option<String> {
    let value: serde_json::Value = match serde_json::from_str(json_line) { Ok(v) => v, Err(_) => return None };
    if value.get("type").and_then(|v| v.as_str()) == Some("content_block_delta") {
        if let Some(text) = value.get("delta")?.get("text").and_then(|v| v.as_str()) {
            if !text.is_empty() { return Some(text.to_string()); }
        }
    }
    None
}

/// Build a system prompt that includes active-tab page context.
pub fn build_system_prompt_with_context(page_title: Option<&str>, page_url: Option<&str>, page_snippet: Option<&str>) -> String {
    let mut parts = Vec::new();
    parts.push("You are Parikaram AI, a helpful assistant embedded in the Parikaram browser.".to_string());
    if let Some(title) = page_title { parts.push(format!("Current page title: {}", title)); }
    if let Some(url) = page_url { parts.push(format!("Current page URL: {}", url)); }
    if let Some(snippet) = page_snippet { parts.push(format!("Page content snippet:\n```html\n{}\n```", snippet)); }
    parts.join("\n")
}

// ---------------------------------------------------------------------------
// Keychain helpers (memory fallback for tests / headless)
// ---------------------------------------------------------------------------

impl AiInner {
    pub fn get_api_key(&self, provider_id: &str) -> Option<String> {
        if self.use_memory_keyring { return self.memory_secrets.get(provider_id).cloned(); }
        if let Ok(entry) = keyring::Entry::new("app.parikaram.ai", provider_id) {
            match entry.get_password() { Ok(key) => return Some(key), Err(_) => {} }
        }
        None
    }

    pub fn set_api_key(&mut self, provider_id: &str, api_key: &str) -> Result<(), String> {
        if self.use_memory_keyring {
            self.memory_secrets.insert(provider_id.to_string(), api_key.to_string());
            return Ok(());
        }
        match keyring::Entry::new("app.parikaram.ai", provider_id) {
            Ok(entry) => entry.set_password(api_key).map_err(|e| e.to_string()),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn delete_api_key(&mut self, provider_id: &str) -> Result<(), String> {
        if self.use_memory_keyring {
            self.memory_secrets.remove(provider_id);
            return Ok(());
        }
        // Best-effort: overwrite with empty string; keyring v3 may not expose delete.
        match keyring::Entry::new("app.parikaram.ai", provider_id) {
            Ok(entry) => entry.set_password("").map_err(|e| e.to_string()),
            Err(_) => Ok(()), // silently ignore missing entries
        }
    }

    #[allow(dead_code)]
    #[allow(dead_code)]
    pub fn has_provider_api_key(&self, provider_id: &str) -> bool {
        self.get_api_key(provider_id).is_some()
    }

    fn refresh_provider_info(&self, info: &AiProviderInfo) -> AiProviderInfo {
        let has_key = self.get_api_key(&info.id).is_some();
        AiProviderInfo { has_key, ..info.clone() }
    }

    fn find_provider(&self, provider_id: &str) -> Option<&AiProviderInfo> {
        self.providers.iter().find(|p| p.id == provider_id)
    }
}

// ---------------------------------------------------------------------------
// Tauri IPC commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_ai_providers(state: State<'_, AiState>) -> Result<Vec<AiProviderInfo>, String> {
    let inner = state.0.lock().map_err(|e| e.to_string())?;
    Ok(inner.providers.iter().map(|p| inner.refresh_provider_info(p)).collect())
}

#[tauri::command]
pub async fn set_provider_api_key(state: State<'_, AiState>, provider_id: String, api_key: String) -> Result<Vec<AiProviderInfo>, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    if !inner.providers.iter().any(|p| p.id == provider_id) { return Err(format!("Unknown provider: {}", provider_id)); }
    inner.set_api_key(&provider_id, &api_key)?;
    drop(inner);
    let inner = state.0.lock().map_err(|e| e.to_string())?;
    Ok(inner.providers.iter().map(|p| inner.refresh_provider_info(p)).collect())
}

#[tauri::command]
pub async fn delete_provider_api_key(state: State<'_, AiState>, provider_id: String) -> Result<Vec<AiProviderInfo>, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    if !inner.providers.iter().any(|p| p.id == provider_id) { return Err(format!("Unknown provider: {}", provider_id)); }
    inner.delete_api_key(&provider_id)?;
    drop(inner);
    let inner = state.0.lock().map_err(|e| e.to_string())?;
    Ok(inner.providers.iter().map(|p| inner.refresh_provider_info(p)).collect())
}

#[tauri::command]
pub async fn list_provider_models(state: State<'_, AiState>, provider_id: String, base_url_override: Option<String>) -> Result<Vec<String>, String> {
    let (provider_info, api_root) = {
        let inner = state.0.lock().map_err(|e| e.to_string())?;
        let provider = inner.find_provider(&provider_id).ok_or_else(|| format!("Unknown provider: {}", provider_id))?;
        let base_url = base_url_override.as_deref().unwrap_or(&provider.base_url);
        let api_root_str: String;
        if base_url.ends_with("/v1") || base_url.ends_with("/v1beta/openai") {
            let end = base_url.rfind('/').unwrap_or(0);
            api_root_str = base_url[..end].to_string();
        } else {
            api_root_str = base_url.to_string();
        };
        (provider.clone(), api_root_str.to_string())
    };

    let key: Option<String> = state.0.lock().map_err(|e| e.to_string())?.get_api_key(&provider_id);

    let client = reqwest::Client::new();
    let mut builder = client.get(format!("{}/models", api_root));
    if provider_info.requires_key {
        if let Some(ref key_val) = key { builder = builder.bearer_auth(key_val.as_str()); }
    }

    let resp = builder.send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Ok(match provider_id.as_str() {
            "openai" => vec!["gpt-4o".into(), "gpt-4o-mini".into(), "gpt-3.5-turbo".into()],
            "anthropic" => vec!["claude-sonnet-4-20250514".into(), "claude-opus-4-20250514".into(), "claude-haiku-3-5-20250514".into()],
            "gemini" => vec!["gemini-2.0-flash".into(), "gemini-2.0-pro".into()],
            "openrouter" => vec!["anthropic/claude-sonnet-4-20250514".into(), "openai/gpt-4o".into()],
            _ => Vec::new(),
        });
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body.get("data").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|o| o.get("id").and_then(|i| i.as_str())).map(String::from).collect()).unwrap_or_default())
}

#[tauri::command]
pub async fn stream_ai_chat(app: AppHandle, ai: State<'_, AiState>, _browser: State<'_, crate::browser::BrowserState>, req: ChatStreamRequest) -> Result<(), String> {
    let cancelled = Arc::new(AtomicBool::new(false));
    { let mut inner = ai.0.lock().map_err(|e| e.to_string())?; inner.cancellation_flags.insert(req.request_id.clone(), cancelled.clone()); }

    // Extract provider info and URL, then drop lock before network call.
    let (base_url, provider_kind) = {
        let inner = ai.0.lock().map_err(|e| e.to_string())?;
        let prov = inner.find_provider(&req.provider_id).ok_or_else(|| format!("Unknown provider: {}", req.provider_id))?;
        let url = if let Some(ref override_url) = req.base_url_override { override_url.clone() } else { prov.base_url.clone() };
        (url, prov.kind.clone())
    };

    // Get API key.
    let api_key: Option<String> = ai.0.lock().map_err(|e| e.to_string())?.get_api_key(&req.provider_id);

    // Build messages with optional page context.
    let mut messages = req.messages.clone();
    if let Some(ref ctx) = req.page_context {
        messages.insert(0, ChatMessage { role: "system".into(), content: format!("Page context:\n```html\n{}\n```", ctx) });
    }

    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let mut payload = serde_json::Map::new();
    payload.insert("model".into(), serde_json::Value::String(req.model.clone()));
    payload.insert("messages".into(), serde_json::to_value(&messages).map_err(|e| e.to_string())?);
    payload.insert("stream".into(), serde_json::Value::Bool(true));
    if let Some(num) = serde_json::Number::from_f64(req.temperature as f64) {
        payload.insert("temperature".into(), serde_json::Value::Number(num));
    } else {
        payload.insert("temperature".into(), serde_json::json!(0.7));
    }

    let client = reqwest::Client::new();
    let mut builder = client.post(&url).json(&serde_json::Value::Object(payload));
    if provider_kind == "anthropic" { builder = builder.header("anthropic-version", "2023-06-01"); }
    if let Some(ref key) = api_key { builder = builder.bearer_auth(key.as_str()); }

    // Spawn streaming task.
    tauri::async_runtime::spawn(async move {
        let mut full_text_buf = String::new();
        let mut stream = match builder.send().await {
            Ok(resp) => resp.bytes_stream(),
            Err(e) => {
                let _ = app.emit("ai-stream-error", AiStreamErrorEvent { request_id: req.request_id.clone(), error: e.to_string() });
                return;
            }
        };

        while let Some(chunk_result) = stream.next().await {
            if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
                let _ = app.emit("ai-stream-error", AiStreamErrorEvent { request_id: req.request_id.clone(), error: "Cancelled by user".into() });
                break;
            }
            let chunk_bytes = match chunk_result { Ok(bytes) => bytes, Err(e) => {
                let _ = app.emit("ai-stream-error", AiStreamErrorEvent { request_id: req.request_id.clone(), error: e.to_string() });
                break;
            }};
            let text = match String::from_utf8(chunk_bytes.to_vec()) { Ok(t) => t, Err(_) => continue };

            for line in text.lines() {
                if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
                    let _ = app.emit("ai-stream-error", AiStreamErrorEvent { request_id: req.request_id.clone(), error: "Cancelled by user".into() });
                    return;
                }
                if let Some(delta) = parse_sse_delta(&provider_kind, line) {
                    full_text_buf.push_str(&delta);
                    let _ = app.emit("ai-stream-chunk", AiStreamChunkEvent { request_id: req.request_id.clone(), delta: delta.clone() });
                }
            }
        }

        let _ = app.emit("ai-stream-done", AiStreamDoneEvent { request_id: req.request_id, full_text: full_text_buf, provider_id: req.provider_id, model: req.model });
    });

    Ok(())
}

#[tauri::command]
pub async fn cancel_ai_stream(state: State<'_, AiState>, request_id: String) -> Result<(), String> {
    let inner = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = inner.cancellation_flags.get(&request_id) { flag.store(true, std::sync::atomic::Ordering::Relaxed); }
    else { return Err(format!("No active stream for request_id: {}", request_id)); }
    Ok(())
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_providers_include_lmstudio_and_ollama() {
        let inner = AiInner::default();
        let ids: Vec<&str> = inner.providers.iter().map(|p| p.id.as_str()).collect();
        assert!(ids.contains(&"lmstudio"), "Must include lmstudio provider");
        assert!(ids.contains(&"ollama"), "Must include ollama provider");
        assert_eq!(ids.len(), 6, "Should have exactly 6 providers");
    }

    #[test]
    fn test_memory_keyring_set_has_delete_roundtrip() {
        let mut inner = AiInner::default();
        inner.use_memory_keyring = true;
        assert!(inner.get_api_key("openai").is_none(), "Key should not exist yet");

        inner.set_api_key("openai", "sk-test-key-12345").unwrap();
        assert_eq!(inner.get_api_key("openai"), Some("sk-test-key-12345".to_string()));

        let info = AiProviderInfo { id: "openai".into(), name: "OpenAI".into(), base_url: "https://api.openai.com/v1".into(), kind: "openai".into(), requires_key: true, has_key: false, default_model: "gpt-4o".into() };
        let refreshed = inner.refresh_provider_info(&info);
        assert!(refreshed.has_key, "has_key should be true after setting");

        inner.delete_api_key("openai").unwrap();
        assert!(inner.get_api_key("openai").is_none(), "Key should be deleted");

        inner.set_api_key("anthropic", "sk-ant-test").unwrap();
        assert_eq!(inner.get_api_key("anthropic"), Some("sk-ant-test".to_string()));
    }

    #[test]
    fn test_parse_openai_sse_delta_chunks_and_done() {
        let line = r#"data: {"choices":[{"delta":{"content":"Hello"}}]}"#;
        assert_eq!(parse_sse_delta("openai", line), Some("Hello".to_string()));

        let empty = r#"data: {"choices":[{"delta":{"content":""}}]}"#;
        assert_eq!(parse_sse_delta("openai", empty), None);

        assert_eq!(parse_sse_delta("openai", "data: [DONE]"), None);
        assert_eq!(parse_sse_delta("openai", ": ping"), None);
        assert_eq!(parse_sse_delta("openai", ""), None);

        let c1 = parse_sse_delta("openai", r#"data: {"choices":[{"delta":{"content":"A"}}]}"#).unwrap();
        let c2 = parse_sse_delta("openai", r#"data: {"choices":[{"delta":{"content":"B"}}]}"#).unwrap();
        assert_eq!(c1, "A");
        assert_eq!(c2, "B");

        assert_eq!(parse_sse_delta("openai", "not json at all"), None);
    }

    #[test]
    fn test_parse_anthropic_sse_content_block_delta() {
        let line = r#"data: {"type":"content_block_delta","delta":{"text":"world"}}"#;
        assert_eq!(parse_sse_delta("anthropic", line), Some("world".to_string()));

        let empty = r#"data: {"type":"content_block_delta","delta":{"text":""}}"#;
        assert_eq!(parse_sse_delta("anthropic", empty), None);

        let wrong_type = r#"data: {"type":"message_start"}"#;
        assert_eq!(parse_sse_delta("anthropic", wrong_type), None);

        assert_eq!(parse_sse_delta("anthropic", "garbage"), None);
    }

    #[test]
    fn test_build_system_prompt_with_page_context() {
        let prompt = build_system_prompt_with_context(
            Some("Rust Programming Language"),
            Some("https://www.rust-lang.org/learn"),
            Some("<h1>Rust</h1><p>A language for reliable software.</p>"),
        );
        assert!(prompt.contains("Parikaram AI"));
        assert!(prompt.contains("Rust Programming Language"));
        assert!(prompt.contains("rust-lang.org"));
        assert!(prompt.contains("A language for reliable software."));
    }

    #[test]
    fn test_cancel_stream_flag_lifecycle() {
        let mut inner = AiInner::default();
        let flag = Arc::new(AtomicBool::new(false));
        inner.cancellation_flags.insert("req-1".into(), flag.clone());
        assert!(!flag.load(std::sync::atomic::Ordering::Relaxed), "Should not be cancelled initially");

        flag.store(true, std::sync::atomic::Ordering::Relaxed);
        assert!(flag.load(std::sync::atomic::Ordering::Relaxed), "Should be cancelled after setting");

        assert!(inner.cancellation_flags.get("nonexistent").is_none());
    }
}
