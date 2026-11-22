import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BrowserSnapshot, AppInfo } from "./types/browser";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { CommandPalette } from "./components/CommandPalette";
import { ViewportHost } from "./components/ViewportHost";

function App() {
  const [snap, setSnap] = useState<BrowserSnapshot | null>(null);
  const [_appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const refreshTabs = useCallback(async () => {
    try {
      const data = await invoke("list_tabs");
      setSnap(data as BrowserSnapshot);
    } catch (e) { console.error("Failed to list tabs:", e); }
  }, []);

  useEffect(() => {
    // Initial hydration
    Promise.all([
      refreshTabs(),
      invoke("get_app_info").then((info) => setAppInfo(info as AppInfo)).catch(console.error),
    ]).catch((e) => setError(String(e)));
  }, [refreshTabs]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key === "t") {
        e.preventDefault();
        invoke("create_tab", { url: null, pinned: false }).then(refreshTabs).catch(console.error);
      } else if (isCtrlOrCmd && e.key === "w") {
        e.preventDefault();
        snap?.active_tab_id && invoke("close_tab", { tabId: snap.active_tab_id }).then(refreshTabs).catch(console.error);
      } else if (isCtrlOrCmd && e.key === "l") {
        e.preventDefault();
        // Focus omnibox — find it via ref or dispatch focus event
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]');
        input?.focus();
      } else if (isCtrlOrCmd && e.key === "\\") {
        e.preventDefault();
        toggleSplitView();
      } else if (isCtrlOrCmd && e.shiftKey && e.key === " ") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      } else if (e.key === "Escape" && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [snap, commandPaletteOpen, refreshTabs]);

  const toggleSplitView = async () => {
    if (!snap) return;
    if (snap.split_tab_id) {
      await invoke("set_split_tabs", { secondaryTabId: null }).then(refreshTabs).catch(console.error);
    } else {
      // Find next tab in active space to pair with
      const tabs = snap.tabs.filter((t) => t.space_id === snap.active_space_id && !t.pinned);
      const currentIndex = tabs.findIndex((t) => t.id === snap.active_tab_id);
      const nextTabId = tabs[(currentIndex + 1) % tabs.length]?.id || null;
      await invoke("set_split_tabs", { secondaryTabId: nextTabId }).then(refreshTabs).catch(console.error);
    }
  };


  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden">
      {/* Error banner */}
      {error && (
        <div className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as any}>
          <span>⚠</span><span>{error}</span>
        </div>
      )}

      {/* TopBar */}
      {snap && (
        <TopBar snap={snap} onRefresh={refreshTabs} onToggleSplit={toggleSplitView} onOpenCommandPalette={() => setCommandPaletteOpen(true)} />
      )}

      {/* Main content area: Sidebar + ViewportHost */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar snap={snap} onRefresh={refreshTabs} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((p) => !p)} />
        <ViewportHost snap={snap} onRefresh={refreshTabs} />
      </div>

      {/* Command Palette (Ctrl+Shift+Space) */}
      {commandPaletteOpen && snap && (
        <CommandPalette snap={snap} onRefresh={refreshTabs} onClose={() => setCommandPaletteOpen(false)} />
      )}
    </div>
  );
}

export default App;

