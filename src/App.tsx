import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BrowserSnapshot, AppInfo } from "./types/browser";
import type { ProfileRecord, BookmarkEntry, NoteEntry, TaskEntry, DrawerTab } from "./types/store";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { CommandPalette } from "./components/CommandPalette";
import { ViewportHost } from "./components/ViewportHost";
import { BookmarksBar } from "./components/BookmarksBar";
import { WorkspaceDrawer } from "./components/WorkspaceDrawer";

function App() {
  const [snap, setSnap] = useState<BrowserSnapshot | null>(null);
  const [_appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Store state (Phase 3B)
  const [_profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [_activeProfileId, setActiveProfileId] = useState("default");
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [_notes, setNotes] = useState<NoteEntry[]>([]);
  const [_tasks, setTasks] = useState<TaskEntry[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("history");

  const refreshTabs = useCallback(async () => {
    try {
      const data = await invoke("list_tabs");
      setSnap(data as BrowserSnapshot);
    } catch (e) { console.error("Failed to list tabs:", e); }
  }, []);

  const refreshStore = useCallback(async () => {
    try {
      const [profilesResult, bookmarksResult, notesResult, tasksResult] = await Promise.all([
        invoke("list_profiles").then((r) => {
          const data = r as [ProfileRecord[], string];
          setActiveProfileId(data[1]);
          return data[0];
        }),
        invoke("list_bookmarks").then((r) => r as BookmarkEntry[]),
        invoke("list_notes").then((r) => r as NoteEntry[]),
        invoke("list_tasks").then((r) => r as TaskEntry[]),
      ]);
      setProfiles(profilesResult);
      setBookmarks(bookmarksResult);
      setNotes(notesResult);
      setTasks(tasksResult);
    } catch (e) { console.error("Failed to refresh store:", e); }
  }, []);

  useEffect(() => {
    Promise.all([
      refreshTabs(),
      invoke("get_app_info").then((info) => setAppInfo(info as AppInfo)).catch(console.error),
      refreshStore(),
    ]).catch((e) => setError(String(e)));
  }, [refreshTabs, refreshStore]);

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
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]');
        input?.focus();
      } else if (isCtrlOrCmd && e.key === "\\") {
        e.preventDefault();
        toggleSplitView();
      } else if (isCtrlOrCmd && e.shiftKey && e.key === " ") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      } else if (isCtrlOrCmd && e.key === "h" && e.shiftKey) {
        e.preventDefault();
        setDrawerOpen(true);
        setDrawerTab("history");
      } else if (isCtrlOrCmd && e.key === "d" && e.shiftKey) {
        e.preventDefault();
        setDrawerOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        if (commandPaletteOpen) setCommandPaletteOpen(false);
        if (drawerOpen) setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [snap, commandPaletteOpen, drawerOpen, refreshTabs]);

  const toggleSplitView = async () => {
    if (!snap) return;
    if (snap.split_tab_id) {
      await invoke("set_split_tabs", { secondaryTabId: null }).then(refreshTabs).catch(console.error);
    } else {
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

      {/* Bookmarks Bar */}
      {snap && (
        <BookmarksBar bookmarks={bookmarks} snap={snap} onRefresh={refreshStore} />
      )}

      {/* Main content area: Sidebar + ViewportHost + WorkspaceDrawer */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar snap={snap} onRefresh={refreshTabs} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((p) => !p)} profiles={_profiles} activeProfileId={_activeProfileId} />
        <ViewportHost snap={snap} onRefresh={refreshTabs} />

        {/* Workspace Drawer */}
        {drawerOpen && (
          <WorkspaceDrawer
            open={drawerOpen}
            activeTab={drawerTab}
            onClose={() => setDrawerOpen(false)}
            onTabChange={(tab) => setDrawerTab(tab)}
          />
        )}
      </div>

      {/* Command Palette */}
      {commandPaletteOpen && snap && (
        <CommandPalette snap={snap} onRefresh={refreshTabs} onClose={() => setCommandPaletteOpen(false)} />
      )}
    </div>
  );
}

export default App;
