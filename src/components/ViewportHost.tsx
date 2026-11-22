import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BrowserSnapshot } from "../types/browser";

interface ViewportHostProps {
  snap: BrowserSnapshot | null;
  onRefresh: () => void;
}

function getHost(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }

export function ViewportHost({ snap, onRefresh }: ViewportHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isTauri, setIsTauri] = useState(false);
  const debounceTimer = useRef<number | null>(null);

  useEffect(() => {
    // Check if running inside Tauri
    setIsTauri(!!window.__TAURI_INTERNALS__);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const sendBounds = () => {
      if (!containerRef.current || !snap) return;
      const rect = containerRef.current.getBoundingClientRect();
      invoke("set_viewport_bounds", { bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } })
        .catch(console.error);
    };

    const observer = new ResizeObserver(() => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(sendBounds, 16);
    });

    observer.observe(containerRef.current);
    sendBounds(); // Initial bounds

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
  }, [snap]);


  if (!snap) return <div ref={containerRef} className="flex-1 bg-[var(--bg-primary)]" />;

  const activeTab = snap.tabs.find((t) => t.id === snap.active_tab_id);
  const splitTab = snap.split_tab_id ? snap.tabs.find((t) => t.id === snap.split_tab_id) : null;

  // If not inside Tauri, show a placeholder
  if (!isTauri) {
    return (
      <div ref={containerRef} className="flex-1 bg-[var(--bg-primary)] flex items-center justify-center relative overflow-hidden">
        {/* Split pane header */}
        {(snap.split_tab_id || snap.overlay_hidden) && (
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)]/90 backdrop-blur-sm border-b border-[var(--border-subtle)]">
            {activeTab && <span className="text-xs text-[var(--text-primary)] truncate">{getHost(activeTab.url)}</span>}
            {splitTab && <span className="text-xs text-[var(--accent)] truncate">+ {getHost(splitTab.url)}</span>}
          </div>
        )}

        {/* Placeholder content */}
        <div className="text-center space-y-3 p-8">
          <div className="w-16 h-16 mx-auto rounded-xl bg-[var(--accent)]/10 flex items-center justify-center border border-[var(--accent)]/20">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--accent)]"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
          </div>
          <h2 className="text-lg font-medium text-[var(--text-primary)]">Parikaram Browser</h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-xs mx-auto">Launch the app with `npm run tauri dev` to see the native WebView engine.</p>
        </div>

        {/* Active tab URL badge */}
        {activeTab && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)]/80 backdrop-blur-sm border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] truncate max-w-md">
            {getHost(activeTab.url)}
          </div>
        )}

        {/* Split view close button */}
        {snap.split_tab_id && (
          <button onClick={() => invoke("set_split_tabs", { secondaryTabId: null }).then(onRefresh).catch(console.error)} className="absolute top-2 right-3 w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-[var(--text-secondary)]" title="Close split view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    );
  }

  // Inside Tauri — the native webview child panes render here automatically.
  return (
    <div ref={containerRef} className="flex-1 bg-[var(--bg-primary)] relative overflow-hidden">
      {/* Split pane header */}
      {snap.split_tab_id && snap.viewport.width > 10 && snap.viewport.height > 10 && !snap.overlay_hidden && (
        <div className="absolute top-0 left-0 right-0 z-[5] flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)]/90 backdrop-blur-sm border-b border-[var(--border-subtle)]">
          {activeTab && <span className="text-xs text-[var(--accent)] font-medium truncate">{getHost(activeTab.url)}</span>}
          {splitTab && <span className="text-xs text-[var(--text-secondary)] truncate">+ {getHost(splitTab.url)}</span>}
          <button onClick={() => invoke("set_split_tabs", { secondaryTabId: null }).then(onRefresh).catch(console.error)} className="ml-auto w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-[var(--text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Active tab URL badge (bottom) */}
      {activeTab && snap.viewport.width > 10 && snap.viewport.height > 10 && !snap.overlay_hidden && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)]/80 backdrop-blur-sm border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] truncate max-w-md z-[5]">
          {getHost(activeTab.url)}
        </div>
      )}

      {/* Loading indicator */}
      {activeTab?.is_loading && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-transparent overflow-hidden z-[10]">
          <div className="h-full bg-[var(--accent)] animate-pulse w-full origin-left" style={{ animation: "loading 1s ease-in-out infinite" }} />
        </div>
      )}
    </div>
  );
}

