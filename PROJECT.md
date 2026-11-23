# Parikaram

Spatial AI work environment with native multi-WebView browser.

Built on **`Tauri v2 + Rust`** (WKWebView / WebView2, mobile-ready iOS/Android), **`React 19 + TypeScript 5`, **`Tailwind CSS v4`.

## Build Phases - Granular Tracker

### Phase 1: Cross-Platform Scaffold (`7f4ba4a`)
- [x] 1.1 Tauri v2 + Rust + React 19 + TypeScript + Tailwind v4 project layout
- [x] 1.2 Multi-target crate config (staticlib, cdylib, rlib) & Windows/macOS capabilities

### Phase 2: Native Multi-WebView Browser Engine
- [x] 2.1 Rust BrowserState manager, URL/search normalizer, split-view rect solver & child Webview commands
- [x] 2.2 React vertical sidebar tabs, workspaces/spaces, pinned tabs, split-view frame & Ctrl+Shift+Space command launcher

### Phase 3: Local-First SQLite + FTS5 Store
- [x] 3.1 Bundled SQLite + FTS5 schema (spaces, tabs, history, bookmarks, notes, tasks, profiles) & Rust IPC
- [x] 3.2 React History search, Bookmarks bar, Notes & Tasks side drawer, and Profile switcher

### Phase 4: Native Rust Network & Ad/Tracker Blocker
- [x] 4.1 Pure-Rust Adblock-Plus filter engine (regex-based) + request interception + per-domain shield toggle & blocked counter

### Phase 5: Multi-Provider & Local AI Sidebar (Ctrl+E)
- [x] 5.1 Rust streaming SSE client for LM Studio (127.0.0.1:1234/v1), Ollama & cloud APIs + OS Keychain storage
- [ ] 5.2 React AI Assistant sidebar with active-tab context injection & model switcher

### Phase 6: Infinite Spatial Work Mode Canvas & Mobile Packaging
- [ ] 6.1 Pan/zoom spatial Work Canvas with parallel AI agent web cards, tables & code blocks
- [ ] 6.2 End-to-end test suite, release bundle verification & macOS/iOS/Android target validation
