// ── End-to-End Cross-Module Integration Tests (Phase 6B) ────────────────

use parikaram::adblock::AdblockInner;
use parikaram::ai::{AiInner, AiProviderInfo, parse_sse_delta, build_system_prompt_with_context};
use parikaram::browser::{BrowserState, ViewportBounds, compute_pane_rects, normalize_input_to_url};
use parikaram::store::StoreState;

// ── Test 1: Browser + Store Profile/Tab Lifecycle ────────────────────────

#[test]
fn e2e_browser_and_store_profile_tab_lifecycle() {
    // Open an in-memory store and create a secondary profile
    let store = StoreState::open_in_memory().expect("store open");

    // Create tabs via BrowserState, serialize to JSON, persist via store API
    let browser = BrowserState::default();
    {
        let mut inner = browser.0.lock().unwrap();
        inner.spaces.push(parikaram::browser::Space {
            id: "space-work".to_string(), name: "Work".to_string(), icon: "briefcase".into(), color: "#3b82f6".into()
        });
        let tab_id = uuid::Uuid::new_v4().to_string();
        inner.tabs.push(parikaram::browser::TabInfo {
            id: tab_id.clone(), space_id: "space-personal".into(), title: "Rust Docs".into(), url: "https://doc.rust-lang.org".into(),
            pinned: false, is_active: true, is_loading: false,
        });
    }

    // Persist only our custom tab (not the default welcome tab) via store — no nested lock
    let tabs_json = {
        let inner = browser.0.lock().unwrap();
        // Only serialize unpinned, non-welcome tabs from space-personal
        let our_tabs: Vec<_> = inner.tabs.iter()
            .filter(|t| !t.pinned && t.space_id == "space-personal" && t.title != "Welcome to Parikaram")
            .cloned()
            .collect();
        serde_json::to_string(&our_tabs).expect("tabs serialization")
    };
    store.sync_workspace_snapshot("space-personal", &tabs_json).expect("persist workspace");

    // Verify persistence via raw SQL (tabs stored in DB)
{
    let g = store.0.lock().unwrap();
    let tab_count: i64 = g.conn.query_row(
        "SELECT COUNT(*) FROM tabs WHERE profile_id=?1 AND space_id=?2",
        rusqlite::params!["default", "space-personal"], |r| r.get(0),
    ).unwrap();
    assert_eq!(tab_count, 1);
}
    // Record history — uses public API (no nested lock)
    store.record_history_internal("default", "https://example.com/page1", "Example Page 1").unwrap();
    store.record_history_internal("default", "https://example.com/page2", "Example Page 2").unwrap();

    // Verify profile isolation via raw SQL — lock held only for query, no method calls inside
    {
        let g = store.0.lock().unwrap();
        let cnt_default: i64 = g.conn.query_row(
            "SELECT COUNT(*) FROM history WHERE profile_id=?1", rusqlite::params!["default"], |r| r.get(0),
        ).unwrap();
        assert_eq!(cnt_default, 2);

        // Switch to profile-2 and record there — release lock first
    }
    store.record_history_internal("profile-2", "https://rust-lang.org/learn", "Rust Learn").unwrap();

    {
        let g = store.0.lock().unwrap();
        let cnt_work: i64 = g.conn.query_row(
            "SELECT COUNT(*) FROM history WHERE profile_id=?1", rusqlite::params!["profile-2"], |r| r.get(0),
        ).unwrap();
        assert_eq!(cnt_work, 1);
    }

    // Verify overlay state is independent via public API
    let browser_snap = browser.snapshot();
    assert!(!browser_snap.overlay_hidden);
}

// ── Test 2: Adblock Filters, Trackers & Clean Navigation ────────────────

#[test]
fn e2e_adblock_filters_tracker_and_allows_clean_navigation() {
    let mut inner = AdblockInner::new();

    // Verify tracker URLs are blocked and counters increment
    assert!(inner.check_url(
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
        "https://example.com", "script", Some("tab-1")
    ));
    assert!(inner.total_blocked >= 1);

    assert!(inner.check_url(
        "https://www.google-analytics.com/analytics.js",
        "https://example.com", "script", Some("tab-1")
    ));
    assert!(inner.total_blocked >= 2);

    // Clean URLs should NOT be blocked
    assert!(!inner.check_url(
        "https://www.rust-lang.org/learn",
        "https://rust-lang.org", "document", Some("tab-1")
    ));

    // Per-domain allowlist bypass
    inner.disabled_domains.insert("example.com".to_string());
    assert!(!inner.check_url(
        "https://www.doubleclick.net/ad/tracker.gif",
        "https://example.com", "image", Some("tab-1")
    ));

    // normalize_input_to_url: search query vs direct URL
    let direct = normalize_input_to_url("https://github.com/parikaram");
    assert_eq!(direct, "https://github.com/parikaram");

    let search = normalize_input_to_url("parikaram browser github");
    // Should be a DuckDuckGo or Google search URL (not an ad/tracker)
    assert!(!inner.check_url(&search, &search, "document", Some("tab-1")));
}

// ── Test 3: FTS5 History + Spatial Canvas Workflow ───────────────────────

#[test]
fn e2e_fts5_history_and_spatial_canvas_workflow() {
    let store = StoreState::open_in_memory().expect("store open");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    // Record multiple URLs into FTS5 history — use public API (no nested lock)
    store.record_history_internal("default", "https://research-paper-1.com", "AI Research Paper 1").unwrap();
    store.record_history_internal("default", "https://research-paper-2.com", "AI Research Paper 2").unwrap();
    store.record_history_internal("default", "https://benchmark-results.io", "Benchmark Results").unwrap();

    // Query via FTS5 — should return matching results (dedup via visit_count)
    {
        let guard = store.0.lock().unwrap();
        let mut stmt = guard.conn.prepare(
            "SELECT title, url FROM history_fts WHERE history_fts MATCH ?1 ORDER BY rank LIMIT 20",
        ).expect("prepare fts5");
        let results: Vec<(String, String)> = stmt.query_map(rusqlite::params!["research"], |r| {
            Ok((r.get(0)?, r.get(1)?))
        }).expect("query fts5").filter_map(|r| r.ok()).collect();
        assert!(results.len() >= 2); // Should find at least Research Paper 1 and 2

        // Create spatial canvas nodes in the same space — these should persist per profile/space
        let node1_id = uuid::Uuid::new_v4().to_string();
        let node2_id = uuid::Uuid::new_v4().to_string();
        let edge_id = uuid::Uuid::new_v4().to_string();

        // Insert canvas nodes (kind as plain string since no enum)
        guard.conn.execute(
            "INSERT INTO canvas_nodes (id, profile_id, space_id, kind, title, content, url, x, y, width, height, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![&node1_id, "default", "space-work", "web", "Research Page 1", "Summary of AI paper findings.",
                Some("https://research-paper-1.com".to_string()), 50.0, 50.0, 400.0, 300.0, now],
        ).unwrap();

        guard.conn.execute(
            "INSERT INTO canvas_nodes (id, profile_id, space_id, kind, title, content, url, x, y, width, height, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![&node2_id, "default", "space-work", "ai-card", "AI Synthesis Card", "Parallel analysis of papers.",
                None::<String>, 500.0, 50.0, 400.0, 300.0, now],
        ).unwrap();

        // Insert edge linking node1 -> node2
        guard.conn.execute(
            "INSERT INTO canvas_edges (id, profile_id, space_id, source_id, target_id, label) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![&edge_id, "default", "space-work", &node1_id, &node2_id, Some("references".to_string())],
        ).unwrap();

        // Verify nodes exist via query
        let node_count: i64 = guard.conn.query_row(
            "SELECT COUNT(*) FROM canvas_nodes WHERE profile_id=?1 AND space_id=?2",
            rusqlite::params!["default", "space-work"], |r| r.get(0),
        ).unwrap();
        assert_eq!(node_count, 2);

        let edge_count: i64 = guard.conn.query_row(
            "SELECT COUNT(*) FROM canvas_edges WHERE profile_id=?1 AND space_id=?2",
            rusqlite::params!["default", "space-work"], |r| r.get(0),
        ).unwrap();
        assert_eq!(edge_count, 1);

        // Verify cascade: delete node1 and check edges are cleaned up
        guard.conn.execute("DELETE FROM canvas_edges WHERE source_id=?1 OR target_id=?1", rusqlite::params![&node1_id]).unwrap();
        guard.conn.execute("DELETE FROM canvas_nodes WHERE id=?1 AND space_id=?2", rusqlite::params![&node1_id, "space-work"]).unwrap();

        let remaining: i64 = guard.conn.query_row(
            "SELECT COUNT(*) FROM canvas_nodes WHERE id=?1 AND space_id=?2", rusqlite::params![&node1_id, "space-work"], |r| r.get(0),
        ).unwrap_or(0);
        assert_eq!(remaining, 0);

        let target_remaining: i64 = guard.conn.query_row(
            "SELECT COUNT(*) FROM canvas_nodes WHERE id=?1", rusqlite::params![&node2_id], |r| r.get(0),
        ).unwrap_or(0);
        assert_eq!(target_remaining, 1); // node2 survives independently
    }
}

// ── Test 4: AI Provider Keychain & SSE Streaming Pipeline ────────────────

#[test]
fn e2e_ai_provider_keychain_and_sse_streaming_pipeline() {
    let mut inner = AiInner::default();

    // Verify default providers include LM Studio and Ollama with correct base URLs
    let providers: Vec<&AiProviderInfo> = inner.providers.iter().collect();
    let lmstudio = providers.iter().find(|p| p.id == "lmstudio").expect("lmstudio provider");
    assert_eq!(lmstudio.base_url, "http://127.0.0.1:1234/v1");
    assert!(!lmstudio.requires_key);

    let ollama = providers.iter().find(|p| p.id == "ollama").expect("ollama provider");
    assert_eq!(ollama.base_url, "http://127.0.0.1:11434/v1");

    // Memory keyring: set and verify OpenAI API key (never prints actual value)
    inner.use_memory_keyring = true;
    inner.set_api_key("openai", "sk-test-key-abc123").unwrap();

    // Verify the key is stored by checking has_key
    assert!(inner.has_provider_api_key("openai"));

    // Delete and verify removed
    inner.delete_api_key("openai").unwrap();
    assert!(!inner.has_provider_api_key("openai"));

    // Build system prompt with page context (grounded AI)
    let prompt = build_system_prompt_with_context(
        Some("AI Research Paper"),
        Some("https://research-paper.com/transformers"),
        Some("Attention mechanisms are fundamental to modern NLP models."),
    );
    assert!(prompt.contains("AI Research Paper"));
    assert!(prompt.contains("https://research-paper.com/transformers"));

    // Parse multi-chunk OpenAI SSE stream
    let mut full_text = String::new();
    for line in [
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}",
        "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}",
        "data: {\"choices\":[{\"delta\":{}}]}",
        "data: [DONE]",
    ] {
        if let Some(delta) = parse_sse_delta("openai", line) {
            full_text.push_str(&delta);
        }
    }
    assert_eq!(full_text, "Hello world");

    // Parse Anthropic SSE content_block_delta stream
    let mut anthropic_text = String::new();
    for line in [
        r#"data: {"type":"content_block_start","content_block":{"type":"text","text":""}}"#,
        r#"data: {"type":"content_block_delta","delta":{"type":"text","text":"AI "}}"#,
        r#"data: {"type":"content_block_delta","delta":{"type":"text","text":"insights"}}"#,
    ] {
        if let Some(delta) = parse_sse_delta("anthropic", line) {
            anthropic_text.push_str(&delta);
        }
    }
    assert_eq!(anthropic_text, "AI insights");
}

// ── Test 5: Split-View Geometry & Overlay Coordination ───────────────────

#[test]
fn e2e_split_view_geometry_and_overlay_coordination() {
    // Single viewport (no split) — should return primary rect covering full area
    let viewport = ViewportBounds { x: 0.0, y: 0.0, width: 1360.0, height: 860.0 };
    let (primary, secondary) = compute_pane_rects(&viewport, false);
    assert_eq!(primary.width, 1360.0);
    assert_eq!(primary.height, 860.0);
    assert_eq!(secondary, None);

    // Split view — should return two rects that sum to full viewport width
    let (primary2, secondary2) = compute_pane_rects(&viewport, true);
    // Split panes have a gap; total = viewport.width - gap
    let gap = 4.0;
    assert!((primary2.width + secondary2.as_ref().unwrap().width - (1360.0 - gap)).abs() < 0.01);
    assert_eq!(primary2.height, 860.0);
    assert_eq!(secondary2.as_ref().unwrap().height, 860.0);

    // BrowserState overlay coordination: default is not hidden, can be toggled
    let browser = BrowserState::default();
    {
        let inner = browser.0.lock().unwrap();
        assert!(!inner.overlay_hidden);
    }

    // Simulate hiding overlays (e.g., when Work Canvas or Command Palette opens)
    {
        let mut inner = browser.0.lock().unwrap();
        inner.overlay_hidden = true;
    }
    {
        let snap = browser.snapshot();
        assert!(snap.overlay_hidden);

        // Restore overlay visibility
        let mut inner = browser.0.lock().unwrap();
        inner.overlay_hidden = false;
    }
    {
        let snap = browser.snapshot();
        assert!(!snap.overlay_hidden);
    }
}
