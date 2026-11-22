# Parikaram

Lightweight native desktop browser and spatial AI work environment.

Built on **Tauri v2 + Rust** (WKWebView / WebView2, mobile-ready iOS/Android), **React 19 + TypeScript 5**, **Tailwind CSS v4**, with vertical sidebar tabs, local SQLite + FTS5 storage, ad/tracker blocking, local LM Studio / Ollama + cloud AI runtime, and infinite spatial Work Mode canvas.

## Build Phases

- [x] Phase 1: Tauri v2 + Rust + React + TypeScript + Tailwind v4 Cross-Platform Scaffold
- [ ] Phase 2: Native Multi-WebView Browser Engine, Vertical Sidebar Tabs, Spaces & Split View
- [ ] Phase 3: Local-First SQLite + FTS5 Store (History, Bookmarks, Notes, Tasks, Isolated Profiles)
- [ ] Phase 4: Native Rust Network Interceptor & Filter-List Ad/Tracker Blocker
- [ ] Phase 5: Multi-Provider & Local AI Sidebar (LM Studio / Ollama + Cloud Providers + OS Keychain)
- [ ] Phase 6: Spatial Work Mode Canvas & Mobile (iOS/Android) Target Packaging

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript 5 + Vite 6 |
| Styling | Tailwind CSS v4 (@tailwindcss/vite) |
| Backend IPC | Tauri commands / events |
| Database | SQLite (rusqlite, bundled - Phase 3) |
| AI | LM Studio / Ollama local + Cloud providers (Phase 5)

## Development

npm run dev          # http://localhost:1420
npm run build        # outputs to dist/
npx tauri dev        # full stack with Rust backend
npx tauri build      # release build
