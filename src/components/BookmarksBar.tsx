import { Star, X, Globe } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { BookmarkEntry } from "../types/store";
import type { BrowserSnapshot } from "../types/browser";

interface BookmarksBarProps {
  bookmarks: BookmarkEntry[];
  snap: BrowserSnapshot | null;
  onRefresh: () => void;
}

function getHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.slice(0, 30); }
}

export function BookmarksBar({ bookmarks, snap, onRefresh }: BookmarksBarProps) {
  if (bookmarks.length === 0 || !snap) return null;

  const activeTab = snap.tabs.find((t) => t.id === snap.active_tab_id);
  const isCurrentPageBookmarked = bookmarks.some(
    (b) => b.url === activeTab?.url && activeTab?.url !== "about:blank"
  );

  const handleNavigate = async (url: string) => {
    if (!snap || !snap.active_tab_id) return;
    await invoke("navigate_tab", { tabId: snap.active_tab_id, input: url })
      .then(onRefresh).catch(console.error);
  };

  const handleToggleBookmark = async () => {
    if (!activeTab) return;
    try {
      const existing = bookmarks.find((b) => b.url === activeTab.url);
      if (existing) {
        await invoke("remove_bookmark", { id: existing.id }).then(onRefresh).catch(console.error);
      } else {
        await invoke("add_bookmark", { title: activeTab.title, url: activeTab.url, spaceId: null })
          .then(onRefresh).catch(console.error);
      }
    } catch (e) { console.error("Bookmark toggle failed:", e); }
  };

  const handleRemove = async (id: string) => {
    await invoke("remove_bookmark", { id }).then(onRefresh).catch(console.error);
  };

  return (
    <div className="h-8 flex items-center gap-1 px-3 overflow-x-auto bg-[var(--bg-secondary)]/60 border-b border-[var(--border-subtle)] backdrop-blur-sm" style={{ WebkitAppRegion: "no-drag" } as any}>
      <div className="flex items-center gap-1 flex-1 overflow-x-auto">
        {bookmarks.map((bm) => (
          <button
            key={bm.id}
            onClick={() => handleNavigate(bm.url)}
            className="group flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 transition-colors flex-shrink-0 max-w-[180px]"
          >
            <Globe size={10} className="opacity-40 flex-shrink-0" />
            <span className="truncate">{getHost(bm.url)}</span>
            <X size={10} onClick={(e) => { e.stopPropagation(); handleRemove(bm.id); }}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 flex-shrink-0 cursor-pointer" />
          </button>
        ))}
      </div>

      {activeTab?.url && activeTab.url !== "about:blank" && (
        <button onClick={handleToggleBookmark} className={`flex-shrink-0 w-6 h-5 flex items-center justify-center rounded transition-colors ${
          isCurrentPageBookmarked ? "text-yellow-400" : "text-[var(--text-secondary)] hover:text-yellow-400"
        }`} title={isCurrentPageBookmarked ? "Remove bookmark" : "Bookmark this page"}>
          <Star size={13} fill={isCurrentPageBookmarked ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}
