import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Globe, Folder, Monitor, SplitSquareHorizontal, X } from "lucide-react";
import type { BrowserSnapshot } from "../types/browser";
import type { HistoryEntry, BookmarkEntry } from "../types/store";

interface CommandPaletteProps {
  snap: BrowserSnapshot | null;
  onRefresh: () => void;
  onClose: () => void;
}

type ActionType = "navigate" | "switchTab" | "switchSpace" | "splitView" | "search";

interface ActionItem {
  id: string;
  label: string;
  subtitle?: string;
  icon: React.ReactNode;
  actionType: ActionType;
  payload?: string;
}

export function CommandPalette({ snap, onRefresh, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [historyResults, setHistoryResults] = useState<HistoryEntry[]>([]);
  const [bookmarkResults, setBookmarkResults] = useState<BookmarkEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    // Hide native webviews so overlay renders on top of WebView2
    invoke("set_overlay_hidden", { hidden: true }).catch(console.error);
    return () => {
      invoke("set_overlay_hidden", { hidden: false }).catch(console.error);
    };
  }, []);

  // Fetch history and bookmarks when query changes
  useEffect(() => {
    if (!query.trim() || !snap) return;
    Promise.all([
      invoke("search_history", { query: query.trim(), limit: 5 }).then((r) => setHistoryResults(r as HistoryEntry[])).catch(() => {}),
      invoke("list_bookmarks").then((r) => setBookmarkResults((r as BookmarkEntry[]).filter((b) => b.title.toLowerCase().includes(query.toLowerCase()) || b.url.toLowerCase().includes(query.toLowerCase())))).catch(() => {}),
    ]);
  }, [query, snap]);

  const actions = useState<ActionItem[]>(() => {
    if (!snap) return [];
    const items: ActionItem[] = [];

    // Navigate/search with current query
    if (query.trim()) {
      const isUrl = query.includes(".") && !query.includes(" ");
      items.push({
        id: "nav-new", label: `Open in new tab`, subtitle: `${isUrl ? query : "Search for"} "${query}"`, icon: <Globe size={14} />, actionType: "navigate", payload: query,
      });
      items.push({
        id: "nav-active", label: `Navigate active tab`, subtitle: `${isUrl ? query : "Search for"} "${query}"`, icon: <Monitor size={14} />, actionType: "search", payload: query,
      });
    }

    // Switch tabs
    snap.tabs.forEach((tab) => {
      items.push({
        id: `tab-${tab.id}`, label: tab.title || "Untitled", subtitle: `${getHost(tab.url)}${tab.space_id === snap.active_space_id ? "" : ` · ${snap.spaces.find(s => s.id === tab.space_id)?.name}`}`, icon: <Monitor size={14} />, actionType: "switchTab", payload: tab.id,
      });
    });

    // Switch spaces
    snap.spaces.forEach((space) => {
      const tabCount = snap.tabs.filter(t => t.space_id === space.id).length;
      items.push({
        id: `space-${space.id}`, label: space.name, subtitle: `${tabCount} tabs`, icon: <Folder size={14} />, actionType: "switchSpace", payload: space.id,
      });
    });

    // Toggle split view
    if (snap.split_tab_id) {
      items.push({ id: "split-off", label: "Close Split View", subtitle: "Return to single pane", icon: <X size={14} />, actionType: "splitView" });
    } else if (snap.tabs.filter(t => t.space_id === snap.active_space_id).length > 1) {
      items.push({ id: "split-on", label: "Toggle Split View", subtitle: "Open active tab alongside next tab", icon: <SplitSquareHorizontal size={14} />, actionType: "splitView" });
    }

    return items;
  })[0];

  const filtered = query.trim() === "" ? actions : actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()) || (a.subtitle && a.subtitle.toLowerCase().includes(query.toLowerCase())));

  function getHost(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }


  const handleAction = async (item: ActionItem) => {
    if (!snap) return;
    switch (item.actionType) {
      case "navigate":
        await invoke("create_tab", { url: item.payload, pinned: false }).then(onRefresh).catch(console.error);
        break;
      case "search":
        await invoke("navigate_tab", { tabId: snap.active_tab_id!, input: item.payload! }).then(onRefresh).catch(console.error);
        break;
      case "switchTab":
        await invoke("activate_tab", { tabId: item.payload! }).then(onRefresh).catch(console.error);
        break;
      case "switchSpace":
        await invoke("switch_space", { spaceId: item.payload! }).then(onRefresh).catch(console.error);
        break;
      case "splitView":
        if (item.id === "split-on" && snap.active_tab_id) {
          const tabs = snap.tabs.filter(t => t.space_id === snap.active_space_id && !t.pinned);
          const nextTabId = tabs.find(t => t.id !== snap.active_tab_id)?.id;
          await invoke("set_split_tabs", { secondaryTabId: nextTabId || null }).then(onRefresh).catch(console.error);
        } else {
          await invoke("set_split_tabs", { secondaryTabId: null }).then(onRefresh).catch(console.error);
        }
        break;
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && filtered[selectedIndex]) { handleAction(filtered[selectedIndex]); }
    else if (e.key === "Escape") { onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-start justify-center pt-[18vh]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Backdrop - darkened overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Palette container */}
      <div className="relative w-full max-w-lg mx-4 rounded-xl overflow-hidden shadow-2xl border border-[var(--border-subtle)]" style={{ backgroundColor: "rgba(18, 18, 30, 0.98)" }}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
          <Search size={18} className="text-[var(--accent)] flex-shrink-0" />
          <input ref={inputRef} type="text" value={query} onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }} onKeyDown={handleKeyDown} placeholder="Type a URL, search query, or command..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-secondary)]" />
          <kbd className="px-2 py-0.5 text-[10px] rounded border border-[var(--border-subtle)] text-[var(--text-secondary)]">ESC</kbd>
        </div>

        {/* Results list */}
        <div className="max-h-72 overflow-y-auto py-1">
          {/* History search results */}
          {historyResults.length > 0 && query.trim() && (
            <div className="px-3 py-2 border-t border-[var(--border-subtle)]">
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mb-1">History</div>
              {historyResults.slice(0, 5).map((h) => (
                <button key={h.id} onClick={() => onClose()} className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-white/5 transition-colors text-left">
                  <Search size={12} className="opacity-40 flex-shrink-0" />
                  <div className="min-w-0 flex-1 truncate">
                    <div className="truncate">{h.title}</div>
                    <div className="text-[9px] opacity-50 truncate">{h.url}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Bookmark results */}
          {bookmarkResults.length > 0 && query.trim() && (
            <div className="px-3 py-2 border-t border-[var(--border-subtle)]">
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mb-1">Bookmarks</div>
              {bookmarkResults.slice(0, 5).map((b) => (
                <button key={b.id} onClick={() => onClose()} className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-white/5 transition-colors text-left">
                  <Globe size={12} className="opacity-40 flex-shrink-0" />
                  <div className="min-w-0 flex-1 truncate">
                    <div className="truncate">{b.title}</div>
                    <div className="text-[9px] opacity-50 truncate">{b.url}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 && !query.trim() && (
            <div className="px-4 py-6 text-center text-sm text-[var(--text-secondary)]">No results found</div>
          )}
          {filtered.map((item, i) => (
            <button key={item.id} onClick={() => handleAction(item)} onMouseEnter={() => setSelectedIndex(i)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === selectedIndex ? "bg-[var(--accent)]/10" : "hover:bg-white/[0.03]"}`}>
              <span className="text-[var(--accent)] flex-shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${i === selectedIndex ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>{item.label}</div>
                {item.subtitle && <div className="text-xs text-[var(--text-secondary)] truncate">{item.subtitle}</div>}
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--border-subtle)] flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
          <span><kbd className="px-1 rounded bg-white/5">↑↓</kbd> Navigate</span>
          <span><kbd className="px-1 rounded bg-white/5">Enter</kbd> Select</span>
          <span><kbd className="px-1 rounded bg-white/5">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

