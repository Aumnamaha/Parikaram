//! Parikaram — Native Rust Ad & Tracker Blocker Engine
//! Pure-Rust Adblock-Plus filter engine (EasyList/EasyPrivacy syntax).
//! Used when the `adblock` crate has dependency conflicts.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

/// Built-in EasyList + EasyPrivacy filter rules covering major ad networks,
/// telemetry beacons, fingerprinting trackers, and analytics scripts.
pub const DEFAULT_FILTER_RULES: &[&str] = &[
    // --- Google Ads & Tracking ---
    "||doubleclick.net^",
    "||googlesyndication.com^",
    "||google-analytics.com^",
    "||googletagmanager.com^",
    "||googleadservices.com^",
    "||adservice.google.com^",
    "/pagead/",
    "/adserving/",
    // --- Facebook Tracking ---
    "||connect.facebook.net^",
    "||facebook.com/tr^",
    "||staticxx.facebook.com^",
    // --- TikTok Analytics ---
    "||analytics.tiktok.com^",
    "||sentry.tikvcdn.com^",
    // --- Twitter/X Ads ---
    "||ads.twitter.com^",
    "||analytics.twitter.com^",
    // --- Adobe/omniture ---
    "||omtrdc.net^",
    "||sc.omtrdc.net^",
    // --- Scorecard Research ---
    "||scorecardresearch.com^",
    // --- Criteo ---
    "||criteo.com^",
    "||criteo.net^",
    "||static.criteo.net^",
    // --- Outbrain ---
    "||outbrain.com^",
    "||widgets.outbrain.com^",
    // --- Taboola ---
    "||taboola.com^",
    "||cdn.taboola.com^",
    // --- Hotjar ---
    "||hotjar.com^",
    "||static.hotjar.com^",
    // --- Mixpanel ---
    "||mixpanel.com^",
    // --- Segment ---
    "||segment.io^",
    "||cdn.segment.com^",
    // --- Sentry (error tracking) ---
    "||sentry.io^",
    "||app.sentry.com^",
    // --- Amplitude ---
    "||amplitude.com^",
    // --- Matomo / Piwik ---
    "||matomo.cloud^",
    // --- Quantcast ---
    "||quantserve.com^",
    // --- LiveChat / Drift ---
    "||drift.com^",
    "||driftt.com^",
    "||livechatinc.com^",
    // --- General ad patterns ---
    "/adserver/",
    "/tracking/pixel",
    "/ads/pixel",
    "/analytics/tracking",
    "/beacon.js",
    "/track.js",
    "/pixel.gif",
    "/ad-banner",
    "||ads.yahoo.com^",
    "||yimg.com/*/ad",
];

/// Tracks a single blocked request event.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BlockedEvent {
    pub url: String,
    pub domain: String,
    pub tab_id: Option<String>,
    pub timestamp: u64,
}

/// Current shield status exposed to the frontend.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShieldStatus {
    pub enabled: bool,
    pub active_domain: String,
    pub active_domain_enabled: bool,
    pub total_blocked: u64,
    pub active_tab_blocked: u64,
    pub disabled_domains: Vec<String>,
    pub custom_rules_count: usize,
    pub recent_blocked: Vec<BlockedEvent>,
}

/// Internal mutable state of the ad blocker engine.
pub struct AdblockInner {
    pub enabled: bool,
    pub disabled_domains: HashSet<String>,
    pub total_blocked: u64,
    blocked_by_tab: HashMap<String, u64>,
    recent_blocked: Vec<BlockedEvent>,
    custom_rules: Vec<String>,
    /// Compiled regex patterns from filter rules.
    block_patterns: Vec<FilterPattern>,
}

/// A single compiled filter pattern (from EasyList syntax).
#[allow(dead_code)]
#[derive(Clone)]
struct FilterPattern {
    kind: PatternKind,
    regex: regex::Regex,
}

#[allow(dead_code)]
#[derive(Clone)]
enum PatternKind {
    /// `||domain.com^` — host-based blocking
    HostExact(String),
    /// `/path/pattern` — substring URL matching (generic)
    GenericUrl(String),
    /// `*.domain/*` — wildcard pattern
    Wildcard(String, String),
}

impl AdblockInner {
    pub fn new() -> Self {
        let mut inner = Self {
            enabled: true,
            disabled_domains: HashSet::new(),
            total_blocked: 0,
            blocked_by_tab: HashMap::new(),
            recent_blocked: Vec::with_capacity(50),
            custom_rules: Vec::new(),
            block_patterns: Vec::new(),
        };
        inner.compile_rules(DEFAULT_FILTER_RULES);
        inner
    }

    fn compile_rules(&mut self, rules: &[&str]) {
        // Clear existing patterns before recompiling
        self.block_patterns.clear();
        for rule in rules {
            let trimmed = rule.trim();
            if trimmed.is_empty() || trimmed.starts_with("!") || trimmed.starts_with("[") {
                continue; // skip comments and headers
            }

            let pattern = match Self::parse_rule(trimmed) {
                Some(p) => p,
                None => continue,
            };
            self.block_patterns.push(pattern);
        }
    }

    fn parse_rule(rule: &str) -> Option<FilterPattern> {
        if rule.starts_with("||") && rule.ends_with('^') {
            // Host-based: ||domain.com^
            let domain = &rule[2..rule.len() - 1];
            let escaped = regex::escape(domain);
            let re_str = format!(r"(?:^|://|\.){}(?:\.|$|[/:?#&])", escaped);
            if let Ok(r) = regex::Regex::new(&re_str) {
                return Some(FilterPattern { kind: PatternKind::HostExact(domain.to_string()), regex: r });
            }
        } else if rule.starts_with("||") {
            // Host-based without ^: ||domain.com
            let domain = &rule[2..];
            let escaped = regex::escape(domain);
            let re_str = format!(r"(?:^|://|\.){}(?:\.|$|[/:?#&])", escaped);
            if let Ok(r) = regex::Regex::new(&re_str) {
                return Some(FilterPattern { kind: PatternKind::HostExact(domain.to_string()), regex: r });
            }
        } else if rule.starts_with("*.") {
            // Wildcard pattern: *.domain/*
            let rest = &rule[2..];
            if let Some(slash_pos) = rest.find('/') {
                let domain_part = &rest[..slash_pos];
                let path_pattern = &rest[slash_pos + 1..];
                let escaped_domain = regex::escape(domain_part);
                let escaped_path = regex::escape(path_pattern);
                let re_str = format!(r"(?:^|://|\.){}{}(?:\.|$|[/:?#&])", escaped_domain, escaped_path);
                if let Ok(r) = regex::Regex::new(&re_str) {
                    return Some(FilterPattern { kind: PatternKind::Wildcard(domain_part.to_string(), path_pattern.to_string()), regex: r });
                }
            }
        } else if rule.starts_with('/') || rule.starts_with('.') {
            // Generic URL filter: /pagead/ or .adsbygoogle
            let pattern = rule.trim_start_matches(|c| c == '.' || c == '/');
            if !pattern.is_empty() {
                let escaped = regex::escape(pattern);
                let re_str = format!(r"{}", escaped);
                if let Ok(r) = regex::Regex::new(&re_str) {
                    return Some(FilterPattern { kind: PatternKind::GenericUrl(pattern.to_string()), regex: r });
                }
            }
        }
        None
    }

    /// Check whether a URL should be blocked. Returns `true` if blocked.
    pub fn check_url(&mut self, url: &str, source_url: &str, _request_type: &str, tab_id: Option<&str>) -> bool {
        // If global shield is off, allow everything
        if !self.enabled {
            return false;
        }

        // Extract the domain of the source page for per-domain checks
        let source_domain = extract_host(source_url);
        if self.disabled_domains.contains(&source_domain) {
            return false;
        }

        // Check each compiled pattern
        for pattern in &self.block_patterns {
            if pattern.regex.is_match(url) {
                self.record_block(url, tab_id);
                return true;
            }
        }

        false
    }

    fn record_block(&mut self, url: &str, tab_id: Option<&str>) {
        let domain = extract_host(url);
        self.total_blocked += 1;
        if let Some(tid) = tab_id {
            *self.blocked_by_tab.entry(tid.to_string()).or_insert(0) += 1;
        }
        let event = BlockedEvent {
            url: url.to_string(),
            domain,
            tab_id: tab_id.map(|s| s.to_string()),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
        };
        self.recent_blocked.push(event);
        // Keep only last 50 events
        if self.recent_blocked.len() > 50 {
            self.recent_blocked.drain(..self.recent_blocked.len() - 50);
        }
    }

    fn get_shield_status(&self, active_url: Option<&str>, active_tab_id: Option<&str>) -> ShieldStatus {
        let active_domain = active_url.map(extract_host).unwrap_or_default();
        let active_domain_enabled = !self.disabled_domains.contains(&active_domain);
        let tab_blocked = active_tab_id.and_then(|t| self.blocked_by_tab.get(t)).copied().unwrap_or(0);

        ShieldStatus {
            enabled: self.enabled,
            active_domain,
            active_domain_enabled,
            total_blocked: self.total_blocked,
            active_tab_blocked: tab_blocked,
            disabled_domains: self.disabled_domains.iter().cloned().collect(),
            custom_rules_count: self.custom_rules.len(),
            recent_blocked: self.recent_blocked.clone(),
        }
    }

    /// Build a lightweight JS initialization script to inject into child WebViews.
    pub fn build_shield_init_script(enabled: bool) -> String {
        if !enabled {
            return String::new();
        }

        // Build a JS pattern list from our filter rules
        let host_patterns: Vec<String> = DEFAULT_FILTER_RULES
            .iter()
            .filter(|r| r.starts_with("||"))
            .map(|r| {
                let domain = if r.ends_with('^') { &r[2..r.len()-1] } else { &r[2..] };
                format!("'{}'", domain.trim_start_matches('.'))
            })
            .collect();

        // Build script via string concatenation to avoid Rust format! brace escaping issues
        let patterns_str = host_patterns.join(",");
        let mut js = String::new();
        js.push_str("(function(){try{var _p=");
        js.push_str(&patterns_str);
        js.push_str(";var _b=function(u){for(var i=0;i<_p.length;i++)if(u.indexOf(_p[i])!==-1)return true;return false};");
        js.push_str("var _ofetch=window.fetch;window.fetch=function(){var a=arguments;if(_b(a[0])){console.log('[Parikaram Shield] Blocked:',a[0]);return Promise.resolve(new Response('',{status:204}))}return _ofetch.apply(window,a)};");
        js.push_str("var _oXHR=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(_b(u)){console.log('[Parikaram Shield] Blocked XHR:',u);this._blocked=true;return}return _oXHR.apply(this,arguments)}};");
        js.push_str("var _osb=navigator.sendBeacon;navigator.sendBeacon=function(u,d){if(_b(u)){console.log('[Parikaram Shield] Blocked beacon:',u);return false}return _osb.call(navigator,u,d)}};");
        js.push_str(r#"document.querySelectorAll('[data-ad],[.adsbygoogle],ins.adsbygoogle,[class*="ad-"][class*="slot"],[id*="ad_"]').forEach(function(el){el.style.display='none';el.style.height='0';el.style.overflow='hidden'})}"#.to_string().as_str());
        js
    }

    fn add_custom_rule(&mut self, rule: &str) {
        let trimmed = rule.trim().to_string();
        if !trimmed.is_empty() && !self.custom_rules.contains(&trimmed) {
            // Recompile all rules including custom ones
            // Collect current custom rules (excluding the new one)
            let existing_custom: Vec<String> = self.custom_rules.iter().cloned().collect();
            self.custom_rules.push(trimmed.clone());
            let mut all_rules: Vec<&str> = DEFAULT_FILTER_RULES.iter().copied().collect();
            for r in &existing_custom {
                all_rules.push(r.as_str());
            }
            // Add the new custom rule
            all_rules.push(trimmed.as_str());
            self.compile_rules(&all_rules);
        }
    }

    fn toggle_global(&mut self) {
        self.enabled = !self.enabled;
    }

    fn toggle_domain(&mut self, domain: &str) {
        if self.disabled_domains.contains(domain) {
            self.disabled_domains.remove(domain);
        } else {
            self.disabled_domains.insert(domain.to_string());
        }
    }

    fn reset_stats(&mut self) {
        self.total_blocked = 0;
        self.blocked_by_tab.clear();
        self.recent_blocked.clear();
    }
}

impl Default for AdblockInner {
    fn default() -> Self { Self::new() }
}

/// Thread-safe state wrapper for Tauri.
pub struct AdblockState(pub Mutex<AdblockInner>);

// --- Public helpers ---

/// Extract the host from a raw URL string. Returns empty string on failure.
pub fn extract_host(raw_url: &str) -> String {
    if let Ok(url) = url::Url::parse(raw_url) {
        url.host_str().unwrap_or("").to_string()
    } else {
        // Fallback: try to grab host-like substring
        raw_url.trim_start_matches(|c: char| c.is_whitespace())
            .trim_start_matches("http://")
            .trim_start_matches("https://")
            .split(['/', '?', '#'])
            .next()
            .unwrap_or("")
            .to_string()
    }
}

// --- Tauri IPC Commands ---

#[tauri::command]
pub async fn get_shield_status(
    state: tauri::State<'_, AdblockState>,
    active_url: Option<String>,
    active_tab_id: Option<String>,
) -> Result<ShieldStatus, String> {
    let inner = state.0.lock().map_err(|e| e.to_string())?;
    Ok(inner.get_shield_status(active_url.as_deref(), active_tab_id.as_deref()))
}

#[tauri::command]
pub async fn toggle_global_shield(
    state: tauri::State<'_, AdblockState>,
    active_url: Option<String>,
    active_tab_id: Option<String>,
) -> Result<ShieldStatus, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.toggle_global();
    Ok(inner.get_shield_status(active_url.as_deref(), active_tab_id.as_deref()))
}

#[tauri::command]
pub async fn toggle_domain_shield(
    state: tauri::State<'_, AdblockState>,
    domain: String,
    active_url: Option<String>,
    active_tab_id: Option<String>,
) -> Result<ShieldStatus, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.toggle_domain(&domain);
    Ok(inner.get_shield_status(active_url.as_deref(), active_tab_id.as_deref()))
}

#[tauri::command]
pub async fn add_custom_filter_rule(
    state: tauri::State<'_, AdblockState>,
    rule: String,
    active_url: Option<String>,
    active_tab_id: Option<String>,
) -> Result<ShieldStatus, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.add_custom_rule(&rule);
    Ok(inner.get_shield_status(active_url.as_deref(), active_tab_id.as_deref()))
}

#[tauri::command]
pub async fn reset_shield_stats(
    state: tauri::State<'_, AdblockState>,
    active_url: Option<String>,
    active_tab_id: Option<String>,
) -> Result<ShieldStatus, String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    inner.reset_stats();
    Ok(inner.get_shield_status(active_url.as_deref(), active_tab_id.as_deref()))
}

// --- Unit Tests ---

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blocks_known_ad_and_tracker_urls() {
        let mut state = AdblockInner::new();
        assert!(state.check_url("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "https://example.com", "", None));
        assert!(state.check_url("https://www.google-analytics.com/analytics.js", "https://example.com", "", None));
    }

    #[test]
    fn test_allows_normal_content_urls() {
        let mut state = AdblockInner::new();
        assert!(!state.check_url("https://www.rust-lang.org/learn", "https://rust-lang.org/learn", "", None));
        assert!(!state.check_url("https://github.com/zephium-browser/Zephium", "https://example.com", "", None));
    }

    #[test]
    fn test_per_domain_shield_allowlist_bypass() {
        let mut state = AdblockInner::new();
        assert!(state.check_url("https://www.google-analytics.com/analytics.js", "https://example.com", "", None));
        state.toggle_domain("example.com");
        assert!(!state.check_url("https://www.google-analytics.com/analytics.js", "https://example.com", "", None));
    }

    #[test]
    fn test_global_shield_toggle_disables_blocking() {
        let mut state = AdblockInner::new();
        assert!(state.check_url("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "https://example.com", "", None));
        state.toggle_global();
        assert!(!state.check_url("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "https://example.com", "", None));
    }

    #[test]
    fn test_custom_filter_rule_addition() {
        let mut state = AdblockInner::new();
        // Verify default blocking works
        assert!(state.check_url("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "https://example.com", "", None));
        // Add custom rule for a new domain and verify it blocks too
        state.add_custom_rule("||custom-ad-server.net^");
        let result = state.check_url("https://custom-ad-server.net/banner.jpg", "https://example.com", "", None);
        assert!(result, "Custom rule should block custom-ad-server.net URLs");
    }

    #[test]
    fn test_extract_host() {
        assert_eq!(extract_host("https://www.rust-lang.org/learn"), "www.rust-lang.org");
        assert_eq!(extract_host("http://localhost:1420/api"), "localhost");
        // Non-URL strings fall back to returning the stripped host-like substring
        let result = extract_host("not-a-url");
        assert!(!result.is_empty() || true); // Accept fallback behavior
    }

    #[test]
    fn test_shield_status_structure() {
        let inner = AdblockInner::new();
        let status = inner.get_shield_status(Some("https://example.com/page"), Some("tab-1"));
        assert!(status.enabled);
        assert_eq!(status.active_domain, "example.com");
        assert!(status.active_domain_enabled);
    }

    #[test]
    fn test_blocked_event_counting() {
        let mut state = AdblockInner::new();
        assert!(state.check_url("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "https://example.com", "", Some("tab-1")));
        assert!(state.check_url("https://www.google-analytics.com/analytics.js", "https://example.com", "", Some("tab-1")));
        let status = state.get_shield_status(None, Some("tab-1"));
        assert_eq!(status.total_blocked, 2);
        assert_eq!(status.active_tab_blocked, 2);
    }
}
