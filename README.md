# Parikaram

**Lightweight native desktop browser and spatial AI work environment.**

Built on Tauri v2 + Rust (WKWebView on macOS, WebView2 on Windows, mobile-ready iOS/Android targets) with React 19 + TypeScript + Tailwind v4. Designed to match and exceed the Zephium browser experience.

---

## Architecture

| Module | Path | Description |
|--------|------|-------------|
| Entry Point | `src-tauri/src/lib.rs` | Tauri app setup, module registration, IPC command routing |
| Browser Engine | `src-tauri/src/browser.rs` | Tab/space management, viewport geometry, native WebView sync |
| Persistent Store | `src-tauri/src/store.rs` | SQLite + FTS5 search for profiles, history, bookmarks, notes, tasks, spatial canvas nodes/edges |
| Ad & Tracker Blocker | `src-tauri/src/adblock.rs` | Brave adblock-rust filter engine (EasyList/EasyPrivacy), global + per-domain shield toggles |
| AI Streaming Runtime | `src-tauri/src/ai.rs` | Multi-provider SSE streaming (LM Studio, Ollama, OpenAI, Anthropic, Gemini, OpenRouter) with OS keychain API key storage |

### Frontend Components

| Component | Path | Description |
|-----------|------|-------------|
| App | `src/App.tsx` | Main layout manager, keyboard shortcuts, state orchestration |
| Sidebar | `src/components/Sidebar.tsx` | Space navigation + profile switcher footer |
| TopBar | `src/components/TopBar.tsx` | Omnibox, bookmarks bar, shields pill, AI toggle, mode switcher |
| ViewportHost | `src/components/ViewportHost.tsx` | Native WebView child host with ResizeObserver |
| CommandPalette | `src/components/CommandPalette.tsx` | Ctrl+Shift+Space launcher with history/bookmark/AI results |
| WorkspaceDrawer | `src/components/WorkspaceDrawer.tsx` | Right-docked History (FTS5 search), Notes, Tasks panel |
| AiSidebar | `src/components/AiSidebar.tsx` | Left-docked AI Assistant sidebar with provider/model switching |
| WorkCanvas | `src/components/WorkCanvas.tsx` | Infinite pan/zoom spatial canvas for parallel AI research cards |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close active tab |
| `Ctrl+L` | Focus omnibox URL bar |
| `Ctrl+\` | Split view toggle |
| `Ctrl+H` | Open History tab in Workspace Drawer |
| `Ctrl+Shift+D` | Toggle Workspace Drawer (History/Notes/Tasks) |
| `Ctrl+E` | Toggle AI Assistant Sidebar |
| `Ctrl+Shift+Space` | Open Command Palette |
| `Ctrl+Shift+W` | Switch to Spatial Work Canvas / Browser Mode |

---

## Local AI Setup

### LM Studio
1. Download from [lmstudio.ai](https://lmstudio.ai)
2. Start the local server on port **1234** (`http://127.0.0.1:1234/v1`)
3. Load any GGUF model — Parikaram will auto-detect it

### Ollama
1. Install from [ollama.ai](https://ollama.ai)
2. Pull a model: `ollama pull llama3`
3. Server runs on **http://127.0.0.1:11434/v1** by default

### Cloud Providers (OpenAI, Anthropic, Gemini, OpenRouter)
- API keys are stored in the OS keychain via Tauri IPC (`set_provider_api_key`)
- Keys never touch localStorage or SQLite — they stay in Windows Credential Manager / macOS Keychain

---

## Build & Test Commands

### Prerequisites
- [Rust Toolchain](https://rustup.rs/) (MSVC on Windows, clang on macOS)
- [Node.js 18+](https://nodejs.org/)
- Tauri CLI: `npm install -g @tauri-apps/cli`

### Development
```bash
# Install frontend dependencies
npm install

# Run dev server with hot reload
npm run tauri dev
```

### Testing
```bash
# TypeScript check
npx tsc --noEmit

# Frontend build
npm run build

# Rust unit + integration tests (35 total)
cargo test --manifest-path src-tauri/Cargo.toml

# Rust release binary
cargo build --release --manifest-path src-tauri/Cargo.toml
```

### Mobile Targets (Tauri v2)
```bash
# iOS
npx tauri ios init     # First time setup
npx tauri ios dev      # Run on simulator/device

# Android
npx tauri android init  # First time setup (requires Android SDK)
npx tauri android dev   # Run on emulator/device
```

### Packaging
```bash
npm run tauri build       # Production bundle for current platform
cargo build --release     # Native Rust binary only
```

---

## Testing Status

- **Unit Tests**: 30 passing (browser, store, adblock, ai modules)
- **Integration Tests**: 5 passing (cross-module E2E workflows)
- **Total**: 35 tests, 0 failures, 0 warnings
