import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BrowserSnapshot } from "../types/browser";


interface ViewportHostProps {
  snap: BrowserSnapshot | null;
  onRefresh: () => void;
}

function getHost(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }

const QUICK_LINKS = [
  { label: "Example.com", url: "https://example.com" },
  { label: "DuckDuckGo", url: "https://duckduckgo.com" },
  { label: "GitHub", url: "https://github.com" },
  { label: "Wikipedia", url: "https://wikipedia.org" },
];

export function ViewportHost({ snap, onRefresh }: ViewportHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isTauri, setIsTauri] = useState(false);
  const debounceTimer = useRef<number | null>(null);

  useEffect(() => {
    setIsTauri(!!window.__TAURI_INTERNALS__);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const sendBounds = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      invoke("set_viewport_bounds", { bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } })
        .catch(console.error);
    };

    const observer = new ResizeObserver(() => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(sendBounds, 16);
    });

    observer.observe(containerRef.current);
    sendBounds(); // Initial bounds — browser.rs sync handles null snap gracefully

    const onWindowResize = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(sendBounds, 16);
    };
    window.addEventListener("resize", onWindowResize);

    return () => {
      observer.disconnect();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      window.removeEventListener("resize", onWindowResize);
    };
  }, []); // Run once; ResizeObserver auto-updates


  const activeTab = snap?.tabs.find((t) => t.id === snap.active_tab_id) ?? null;
  const splitTab = snap?.split_tab_id ? snap.tabs.find((t) => t.id === snap.split_tab_id) : null;

  // Defensive: show welcome when snap is unexpectedly null or not in Tauri
  if (!snap || !isTauri) {
    return (
      <div ref={containerRef} className="flex-1 bg-[#0e1118] flex items-center justify-center relative overflow-hidden">
        {/* Split pane header */}
        {(snap?.split_tab_id || snap?.overlay_hidden) && (
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 border-b border-white/[0.06] bg-[#0b0d13]/90 px-3 py-1.5 backdrop-blur-sm">
            {activeTab && <span className="truncate text-xs text-zinc-400">{getHost(activeTab.url)}</span>}
            {splitTab && <span className="truncate text-xs text-indigo-400">+ {getHost(splitTab.url)}</span>}
          </div>
        )}

        {/* Welcome / placeholder */}
        <div className="space-y-3 p-8 text-center max-w-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </div>
          <h2 className="text-base font-medium text-zinc-400">Parikaram Browser</h2>
          {!isTauri && <p className="max-w-xs text-sm text-zinc-600 mx-auto">Launch with `npm run tauri dev` for native WebView engine.</p>}

          {/* Quick-launch buttons */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {QUICK_LINKS.map((link) => (
              <button key={link.url} onClick={() => invoke("create_tab", { url: link.url, pinned: false }).then(onRefresh).catch(console.error)}
                className="rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-zinc-400 hover:bg-white/[0.06] transition-colors">
                {link.label}
              </button>
            ))}
          </div>

          <p className="text-[9px] text-zinc-700 pt-2">Ctrl+T new tab · Ctrl+Shift+W Work Canvas</p>
        </div>

        {/* Active tab URL badge */}
        {activeTab && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 truncate rounded-md border border-white/[0.06] bg-[#0b0d13]/80 px-3 py-1 text-xs text-zinc-600 backdrop-blur-sm max-w-md">
            {getHost(activeTab.url)}
          </div>
        )}

        {/* Split view close button */}
        {snap?.split_tab_id && (
          <button onClick={() => invoke("set_split_tabs", { secondaryTabId: null }).then(onRefresh).catch(console.error)} className="absolute right-3 top-2 flex h-6 w-6 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.06]" title="Close split view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>
    );
  }

  // Inside Tauri — native WebView child panes render here automatically.
  return (
    <div ref={containerRef} className="flex-1 bg-[#0e1118] relative overflow-hidden">
      {/* Split pane header */}
      {snap.split_tab_id && snap.viewport.width > 10 && snap.viewport.height > 10 && !snap.overlay_hidden && (
        <div className="absolute top-0 left-0 right-0 z-[5] flex items-center gap-2 border-b border-white/[0.06] bg-[#0b0d13]/90 px-3 py-1.5 backdrop-blur-sm">
          {activeTab && <span className="truncate text-xs font-medium text-indigo-400">{getHost(activeTab.url)}</span>}
          {splitTab && <span className="truncate text-xs text-zinc-600">+ {getHost(splitTab.url)}</span>}
          <button onClick={() => invoke("set_split_tabs", { secondaryTabId: null }).then(onRefresh).catch(console.error)} className="ml-auto flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.06]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {/* Active tab URL badge (bottom) */}
      {activeTab && snap.viewport.width > 10 && snap.viewport.height > 10 && !snap.overlay_hidden && (
        <div className="absolute bottom-3 left-1/2 z-[5] -translate-x-1/2 truncate rounded-md border border-white/[0.06] bg-[#0b0d13]/80 px-3 py-1 text-xs text-zinc-600 backdrop-blur-sm max-w-md">
          {getHost(activeTab.url)}
        </div>
      )}

      {/* Loading indicator */}
      {activeTab?.is_loading && (
        <div className="absolute top-0 left-0 right-0 z-[10] h-0.5 overflow-hidden bg-transparent">
          <div className="h-full w-full origin-left bg-indigo-500 animate-pulse" style={{ animation: "loading 1s ease-in-out infinite" }} />
        </div>
      )}
    </div>
  );
}
