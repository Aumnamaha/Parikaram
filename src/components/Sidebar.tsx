import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Pin, X, SplitSquareHorizontal } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { BrowserSnapshot } from "../types/browser";
import { ProfileSwitcher } from "./ProfileSwitcher";

import type { ProfileRecord } from "../types/store";

interface SidebarProps {
  snap: BrowserSnapshot | null;
  onRefresh: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  profiles?: ProfileRecord[];
  activeProfileId?: string;
}

function getFavicon(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return "";
  }
}

export function Sidebar({ snap, onRefresh, collapsed, onToggleCollapse, profiles = [], activeProfileId = "default" }: SidebarProps) {
  const [showSpaceCreator, setShowSpaceCreator] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_newSpaceIcon, _setNewSpaceIcon] = useState("folder");
  const [newSpaceColor, setNewSpaceColor] = useState("#6366f1");

  if (!snap) {
    return (
      <div className={`h-full bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] flex items-center justify-center ${collapsed ? "w-14" : "w-64"}`}>
        {!collapsed && <span className="text-xs text-[var(--text-secondary)]">Loading...</span>}
      </div>
    );
  }

  const pinnedTabs = snap.tabs.filter((t) => t.pinned && t.space_id === snap.active_space_id);
  const regularTabs = snap.tabs.filter((t) => !t.pinned && t.space_id === snap.active_space_id);

  const handleCreateSpace = async () => {
    if (!newSpaceName.trim()) return;
    try {
      await invoke("create_space", { name: newSpaceName, icon: _newSpaceIcon, color: newSpaceColor });
      setShowSpaceCreator(false);
      setNewSpaceName("");
      onRefresh();
    } catch (e) { console.error("Create space failed:", e); }
  };


  return (
    <div className={`h-full flex flex-col bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] transition-all duration-200 ${collapsed ? "w-14" : "w-64"}`}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-subtle)]">
        {!collapsed && <span className="text-sm font-semibold tracking-wide text-[var(--accent)]">Parikaram</span>}
        <button onClick={onToggleCollapse} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/5 transition-colors" title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Spaces</span>
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {snap.spaces.map((space) => (
                <button key={space.id} onClick={() => invoke("switch_space", { spaceId: space.id }).then(onRefresh).catch(console.error)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${space.id === snap.active_space_id ? "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30" : "text-[var(--text-secondary)] hover:bg-white/5 border border-transparent"}`}
                  style={space.id === snap.active_space_id ? { backgroundColor: `${space.color}22`, borderColor: `${space.color}44` } : undefined}>
                  <span className="mr-1">{space.icon}</span>{space.name}
                </button>
              ))}
              <button onClick={() => setShowSpaceCreator(true)} className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:bg-white/5 transition-colors" title="New Space">
                <Plus size={12} />
              </button>
            </div>


            {showSpaceCreator && (
              <div className="mt-2 p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                <input type="text" placeholder="Space name" value={newSpaceName} onChange={(e) => setNewSpaceName(e.target.value)} className="w-full px-2 py-1 text-xs bg-transparent border-b border-[var(--border-subtle)] focus:border-[var(--accent)] outline-none mb-1.5" />
                <div className="flex gap-1">
                  <input type="color" value={newSpaceColor} onChange={(e) => setNewSpaceColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" title="Accent color" />
                  <button onClick={handleCreateSpace} className="flex-1 px-2 py-1 text-xs bg-[var(--accent)] hover:bg-[var(--accent)]/80 rounded transition-colors">Create</button>
                </div>
              </div>
            )}
          </div>

          {pinnedTabs.length > 0 && (
            <div className="px-3 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Pinned</span>
              <div className="grid grid-cols-2 gap-1 mt-1.5">
                {pinnedTabs.map((tab) => (
                  <button key={tab.id} onClick={() => invoke("activate_tab", { tabId: tab.id }).then(onRefresh).catch(console.error)}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs truncate transition-colors ${tab.is_active ? "bg-white/5 border border-[var(--accent)]/20" : "hover:bg-white/3 border border-transparent"}`}>
                    {getFavicon(tab.url) && <img src={getFavicon(tab.url)} alt="" className="w-3 h-3 rounded-sm flex-shrink-0" />}
                    <span className="truncate">{tab.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}


          {regularTabs.length > 0 && (
            <div className="px-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Workspace</span>
              <div className="mt-1 space-y-0.5">
                {regularTabs.map((tab) => (
                  <div key={tab.id} className={`group flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${tab.is_active ? "bg-white/8 border-l-2 border-[var(--accent)]" : "hover:bg-white/[0.03] border-l-2 border-transparent"}`}>
                    {getFavicon(tab.url) && <img src={getFavicon(tab.url)} alt="" className="w-3 h-3 rounded-sm flex-shrink-0" />}
                    <button onClick={() => invoke("activate_tab", { tabId: tab.id }).then(onRefresh).catch(console.error)} className="flex-1 text-left truncate hover:text-white transition-colors">
                      <span className={tab.is_active ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"}>{tab.title}</span>
                    </button>
                    <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => invoke("set_split_tabs", { secondaryTabId: tab.is_active ? null : tab.id }).then(onRefresh).catch(console.error)} className="w-4 h-4 flex items-center justify-center rounded hover:bg-white/10" title="Open in split"><SplitSquareHorizontal size={10} /></button>
                      <button onClick={() => invoke("activate_tab", { tabId: tab.id }).then(onRefresh).catch(console.error)} className="w-4 h-4 flex items-center justify-center rounded hover:bg-white/10" title="Pin"><Pin size={10} /></button>
                      <button onClick={() => invoke("close_tab", { tabId: tab.id }).then(onRefresh).catch(console.error)} className="w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/20 hover:text-red-400 transition-colors"><X size={10} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}


          <div className="px-3 mt-2">
            <button onClick={() => invoke("create_tab", { url: null, pinned: false }).then(onRefresh).catch(console.error)} className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 border border-[var(--accent)]/20 transition-colors">
              <Plus size={12} /> New Tab <span className="text-[9px] opacity-50 ml-auto">⌘T</span>
            </button>
          </div>
        </div>
      )}

      {!collapsed && (
        <ProfileSwitcher
          profiles={profiles}
          activeProfileId={activeProfileId}
          onSwitch={(pid) => invoke("switch_profile", { profileId: pid }).then(onRefresh).catch(console.error)}
          onCreateNew={() => {
            const name = `Profile ${profiles.length + 1}`;
            invoke("create_profile", { name, accentColor: "#6366f1" }).then(() => onRefresh()).catch(console.error);
          }}
          onPopoverOpenChange={(open) => invoke("set_overlay_hidden", { hidden: open }).catch(console.error)}
        />
      )}

      {collapsed && (
        <div className="flex flex-col items-center gap-2 py-3">
          <button onClick={() => invoke("create_tab", { url: null, pinned: false }).then(onRefresh).catch(console.error)} className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors" title="New Tab (⌘T)">
            <Plus size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

