import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BrowserSnapshot, AppInfo } from "./types/browser";
import type { ProfileRecord, BookmarkEntry, NoteEntry, TaskEntry, DrawerTab, ShieldStatus } from "./types/store";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { CommandPalette } from "./components/CommandPalette";
import { ViewportHost } from "./components/ViewportHost";
import { BookmarksBar } from "./components/BookmarksBar";
import { WorkspaceDrawer } from "./components/WorkspaceDrawer";
import { AiSidebar } from "./components/AiSidebar";
import { WorkCanvas } from "./components/WorkCanvas";

/* ── DEFAULT_SNAPSHOT: guarantees the UI renders immediately on frame 1, never hanging on "Loading..." or "Initializing workspace..." ── */
const WELCOME_TAB_ID = "tab-welcome";
const PERSONAL_SPACE_ID = "space-personal";

function makeDefaultSnapshot(): BrowserSnapshot {
  return {
    spaces: [{ id: PERSONAL_SPACE_ID, name: "Personal", icon: "folder", color: "#6366f1" }],
    active_space_id: PERSONAL_SPACE_ID,
    tabs: [
      { id: WELCOME_TAB_ID, space_id: PERSONAL_SPACE_ID, title: "Welcome to Parikaram", url: "https://example.com", pinned: false, is_active: true, is_loading: false },
    ],
    active_tab_id: WELCOME_TAB_ID,
    split_tab_id: null,
    viewport: { x: 0, y: 0, width: 1360, height: 860 },
    overlay_hidden: false,
  };
}

function App() {
  const [snap, setSnap] = useState<BrowserSnapshot>(makeDefaultSnapshot);
  const [_appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [workMode, setWorkMode] = useState(false);

  // Store state (Phase 3B)
  const [_profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [_activeProfileId, setActiveProfileId] = useState("default");
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [_notes, setNotes] = useState<NoteEntry[]>([]);
  const [_tasks, setTasks] = useState<TaskEntry[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("history");

  // Shield state (Phase 4)
  const [shieldStatus, setShieldStatus] = useState<ShieldStatus | null>(null);

  const refreshTabs = useCallback(async () => {
    try {
      const data = await invoke("list_tabs") as BrowserSnapshot;
      if (data && data.tabs.length > 0) setSnap(data);
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

  const fetchShieldStatus = useCallback(async () => {
    if (!snap.active_tab_id) return;
    try {
      const data = await invoke("get_shield_status", { activeUrl: snap.tabs.find(t => t.id === snap.active_tab_id)?.url, activeTabId: snap.active_tab_id });
      setShieldStatus(data as ShieldStatus);
    } catch (e) { console.error("Failed to fetch shield status:", e); }
  }, [snap]);

  // Initialize all data in parallel; errors don't block UI from rendering.
  // The DEFAULT_SNAPSHOT ensures the UI is immediately interactive on frame 1.
  useEffect(() => {
    Promise.allSettled([
      refreshTabs(),
      invoke("get_app_info").then((info) => setAppInfo(info as AppInfo)).catch(console.error),
      refreshStore(),
    ]).then((results) => {
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (rejected.length > 0) {
        setError(rejected.map((r) => String(r.reason)).join("; ") || "Some initial data failed to load");
      }
    });
    fetchShieldStatus();
  }, [refreshTabs, refreshStore, fetchShieldStatus]);

  // Hide native child WebViews when in Work Canvas mode or command palette open
  const setOverlayHidden = useCallback((hidden: boolean) => {
    invoke("set_overlay_hidden", { hidden }).catch(console.error);
  }, []);

  useEffect(() => {
    const overlayHidden = workMode || commandPaletteOpen;
    setOverlayHidden(overlayHidden);
  }, [workMode, commandPaletteOpen, setOverlayHidden]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key === "t") {
        e.preventDefault();
        invoke("create_tab", { url: null, pinned: false }).then(refreshTabs).catch(console.error);
      } else if (isCtrlOrCmd && e.key === "w") {
        e.preventDefault();
        snap.active_tab_id && invoke("close_tab", { tabId: snap.active_tab_id }).then(refreshTabs).catch(console.error);
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
      } else if ((isCtrlOrCmd || e.metaKey) && e.key === "e") {
        e.preventDefault();
        setAiSidebarOpen((prev) => !prev);
      } else if (isCtrlOrCmd && e.shiftKey && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        setWorkMode((p) => !p);
      } else if (e.key === "Escape") {
        if (commandPaletteOpen) setCommandPaletteOpen(false);
        if (drawerOpen) setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [snap, commandPaletteOpen, drawerOpen, aiSidebarOpen, workMode, refreshTabs]);

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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#090b10] select-none text-zinc-200">
      {/* Error banner */}
      {error && (
        <div className="z-50 border-b border-red-500/20 bg-red-500/[0.06] px-3 py-1.5 text-[11px] text-red-400" style={{ WebkitAppRegion: "no-drag" } as any}>
          <span className="mr-1">⚠</span>{error}
        </div>
      )}

      {/* TopBar — always rendered unconditionally */}
      <TopBar
        snap={snap}
        onRefresh={() => { refreshTabs(); fetchShieldStatus(); }}
        onToggleSplit={toggleSplitView}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onToggleAiSidebar={() => setAiSidebarOpen((p) => !p)}
        shieldStatus={shieldStatus}
        onShieldPopoverToggle={(open) => { if (open) invoke("set_overlay_hidden", { hidden: true }).catch(console.error); else invoke("set_overlay_hidden", { hidden: false }).catch(console.error); }}
        workMode={workMode}
        onToggleWorkMode={() => setWorkMode((p) => !p)}
      />

      {/* Bookmarks Bar — always rendered in browser mode */}
      {!workMode && (
        <BookmarksBar bookmarks={bookmarks} snap={snap} onRefresh={refreshStore} />
      )}

      {workMode ? (
        /* ── Work Canvas Mode — Zephium inset frame ──────────── */
        <div className="flex-1 bg-[#090b10] p-1.5 overflow-hidden">
          <div className="h-full rounded-xl border border-white/[0.08] bg-[#0e1118] shadow-2xl overflow-hidden relative">
            <WorkCanvas snap={snap} activeSpaceId={snap.active_space_id} />
          </div>
        </div>
      ) : (
        /* ── Browser Mode — Zephium inset frame ─────────────── */
        <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
          {/* Sidebar — left panel, shrink-0, obsidian */}
          <Sidebar
            snap={snap}
            onRefresh={refreshTabs}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
            profiles={_profiles}
            activeProfileId={_activeProfileId}
          />

          {/* Main viewport area — Zephium inset framed card */}
          <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
            <ViewportHost snap={snap} onRefresh={refreshTabs} />

            {/* Workspace Drawer — right docked panel */}
            {drawerOpen && (
              <WorkspaceDrawer
                open={drawerOpen}
                activeTab={drawerTab}
                onClose={() => setDrawerOpen(false)}
                onTabChange={(tab) => setDrawerTab(tab)}
              />
            )}

            {/* AI Assistant Sidebar — right docked panel */}
            {aiSidebarOpen && (
              <AiSidebar snap={snap} onClose={() => setAiSidebarOpen(false)} />
            )}
          </div>
        </div>
      )}

      {/* Command Palette (browser mode only) */}
      {!workMode && commandPaletteOpen && (
        <CommandPalette snap={snap} onRefresh={refreshTabs} onClose={() => setCommandPaletteOpen(false)} onToggleAiSidebar={() => setAiSidebarOpen((p) => !p)} />
      )}
    </div>
  );
}

export default App;
