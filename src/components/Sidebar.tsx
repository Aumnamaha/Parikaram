import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Pin, X, SplitSquareHorizontal, Folder, Briefcase, Sparkles, Globe, Heart, Star, BookOpen, Compass, Code2, Palette, Radio, Zap, Settings, User, Users, Calendar, Tag } from "lucide-react";
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

// Map icon names from store to Lucide React components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  folder: Folder,
  briefcase: Briefcase,
  sparkles: Sparkles,
  globe: Globe,
  heart: Heart,
  star: Star,
  book: BookOpen,
  books: BookOpen,
  compass: Compass,
  code: Code2,
  palette: Palette,
  radio: Radio,
  zap: Zap,
  settings: Settings,
  user: User,
  users: Users,
  calendar: Calendar,
  tag: Tag,
};

function SpaceIcon({ name }: { name: string }) {
  const IconComponent = ICON_MAP[name.toLowerCase()] || Folder;
  return <IconComponent className="w-3.5 h-3.5" />;
}

export function Sidebar({ snap, onRefresh, collapsed, onToggleCollapse, profiles = [], activeProfileId = "default" }: SidebarProps) {
  const [showSpaceCreator, setShowSpaceCreator] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_newSpaceIcon, _setNewSpaceIcon] = useState("folder");
  const [newSpaceColor, setNewSpaceColor] = useState("#6366f1");

  if (!snap) {
    return (
      <div className={`flex h-full flex-col items-center justify-center bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] transition-all duration-200 ${collapsed ? "w-14" : "w-64"}`}>
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
    <div className={`flex h-full flex-col bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] transition-all duration-200 ${collapsed ? "w-14" : "w-64"}`}>
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2.5">
        {!collapsed && <span className="text-sm font-semibold tracking-wide text-[var(--accent)]">Parikaram</span>}
        <button onClick={onToggleCollapse} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/5 transition-colors" title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Spaces</span>
            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
              {snap.spaces.map((space) => (
                <button key={space.id} onClick={() => invoke("switch_space", { spaceId: space.id }).then(onRefresh).catch(console.error)}
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors ${space.id === snap.active_space_id ? "border border-[var(--accent)]/30 bg-[var(--accent)]/20 text-[var(--accent)]" : "border border-transparent text-[var(--text-secondary)] hover:bg-white/5"}`}
                  style={space.id === snap.active_space_id ? { backgroundColor: `${space.color}22`, borderColor: `${space.color}44` } : undefined}>
                  <SpaceIcon name={space.icon} />
                  <span className="ml-1">{space.name}</span>
                </button>
              ))}
              <button onClick={() => setShowSpaceCreator(true)} className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-white/5 transition-colors" title="New Space">
                <Plus size={12} />
              </button>
            </div>

{showSpaceCreator && (
              <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2">
                <input type="text" placeholder="Space name" value={newSpaceName} onChange={(e) => setNewSpaceName(e.target.value)} className="w-full border-b border-[var(--border-subtle)] bg-transparent px-2 py-1 text-xs focus:border-[var(--accent)] outline-none mb-1.5" />
                <div className="flex gap-1">
                  <input type="color" value={newSpaceColor} onChange={(e) => setNewSpaceColor(e.target.value)} className="h-6 w-6 cursor-pointer rounded bg-transparent border-0 p-0" title="Accent color" />
                  <button onClick={handleCreateSpace} className="flex flex-1 items-center justify-center rounded px-2 py-1 text-xs font-medium bg-[var(--accent)] hover:bg-[var(--accent)]/80 transition-colors">Create</button>
                </div>
              </div>
            )}
          </div>

          {pinnedTabs.length > 0 && (
            <div className="mb-2 px-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Pinned</span>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                {pinnedTabs.map((tab) => (
                  <button key={tab.id} onClick={() => invoke("activate_tab", { tabId: tab.id }).then(onRefresh).catch(console.error)}
                    className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors ${tab.is_active ? "border border-[var(--accent)]/20 bg-white/5" : "border border-transparent hover:bg-white/3"}`}>
                    {getFavicon(tab.url) && <img src={getFavicon(tab.url)} alt="" className="h-3 w-3 flex-shrink-0 rounded-sm" />}
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
                  <div key={tab.id} className={`group flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${tab.is_active ? "border-l-2 border-[var(--accent)] bg-white/8" : "border-l-2 border-transparent hover:bg-white/[0.03]"}`}>
                    {getFavicon(tab.url) && <img src={getFavicon(tab.url)} alt="" className="h-3 w-3 flex-shrink-0 rounded-sm" />}
                    <button onClick={() => invoke("activate_tab", { tabId: tab.id }).then(onRefresh).catch(console.error)} className="flex-1 truncate text-left hover:text-white transition-colors">
                      <span className={tab.is_active ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>{tab.title}</span>
                    </button>
                    <div className="hidden flex-shrink-0 gap-0.5 group-hover:flex items-center">
                      <button onClick={() => invoke("set_split_tabs", { secondaryTabId: tab.is_active ? null : tab.id }).then(onRefresh).catch(console.error)} className="flex h-4 w-4 items-center justify-center rounded hover:bg-white/10" title="Open in split"><SplitSquareHorizontal size={10} /></button>
                      <button onClick={() => invoke("activate_tab", { tabId: tab.id }).then(onRefresh).catch(console.error)} className="flex h-4 w-4 items-center justify-center rounded hover:bg-white/10" title="Pin"><Pin size={10} /></button>
                      <button onClick={() => invoke("close_tab", { tabId: tab.id }).then(onRefresh).catch(console.error)} className="flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-red-500/20 hover:text-red-400"><X size={10} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}


          <div className="mt-2 px-3">
            <button onClick={() => invoke("create_tab", { url: null, pinned: false }).then(onRefresh).catch(console.error)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-2 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors">
              <Plus size={12} /> New Tab <span className="ml-auto text-[9px] opacity-50">⌘T</span>
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
          <button onClick={() => invoke("create_tab", { url: null, pinned: false }).then(onRefresh).catch(console.error)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/5 transition-colors" title="New Tab (⌘T)">
            <Plus size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
