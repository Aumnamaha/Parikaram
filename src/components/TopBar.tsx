import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, ArrowRight, RotateCw, Search, SplitSquareHorizontal, Command } from "lucide-react";
import type { BrowserSnapshot } from "../types/browser";

interface TopBarProps {
  snap: BrowserSnapshot | null;
  onRefresh: () => void;
  onToggleSplit: () => void;
  onOpenCommandPalette: () => void;
}

function getHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function TopBar({ snap, onRefresh, onToggleSplit, onOpenCommandPalette }: TopBarProps) {
  const [omniboxValue, setOmniboxValue] = useState("");
  const omniboxRef = useRef<HTMLInputElement>(null);

  if (!snap || !snap.active_tab_id) return null;

  const activeTab = snap.tabs.find((t) => t.id === snap.active_tab_id);
  if (!activeTab) return null;

  setOmniboxValue(activeTab.url);

  const handleNavigate = async (input: string) => {
    if (!snap || !snap.active_tab_id) return;
    await invoke("navigate_tab", { tabId: snap.active_tab_id, input }).then(onRefresh).catch(console.error);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleNavigate(omniboxValue);
  };

  const canGoBack = true; // In real impl, track history per tab
  const canGoForward = false;

  return (
    <div className="h-12 flex items-center gap-2 px-3 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)]">
      {/* Navigation controls */}
      <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as any}>
        <button onClick={() => snap.active_tab_id && invoke("go_back_tab", { tabId: snap.active_tab_id }).then(onRefresh).catch(console.error)} disabled={!canGoBack} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors disabled:opacity-30">
          <ArrowLeft size={16} />
        </button>
        <button onClick={() => snap.active_tab_id && invoke("go_forward_tab", { tabId: snap.active_tab_id }).then(onRefresh).catch(console.error)} disabled={!canGoForward} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors disabled:opacity-30">
          <ArrowRight size={16} />
        </button>
        <button onClick={() => snap.active_tab_id && invoke("reload_tab", { tabId: snap.active_tab_id }).then(onRefresh).catch(console.error)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors">
          <RotateCw size={16} />
        </button>
      </div>

      {/* Omnibox */}
      <form onSubmit={handleSubmit} className="flex-1" style={{ WebkitAppRegion: "no-drag" } as any}>
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-3 text-[var(--text-secondary)] pointer-events-none" />
          <input ref={omniboxRef} type="text" value={omniboxValue} onChange={(e) => setOmniboxValue(e.target.value)} onBlur={() => handleNavigate(omniboxValue.trim())} onKeyDown={(e) => { if (e.key === "Enter") handleNavigate((e.target as HTMLInputElement).value); }} className="w-full pl-9 pr-4 py-1.5 text-sm bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-glow)] outline-none transition-all" placeholder="Search or enter URL" />
        </div>
      </form>

      {/* Split view toggle */}
      <button onClick={onToggleSplit} className={`w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors ${snap.split_tab_id ? "text-[var(--accent)]" : ""}`} title="Toggle split view (Ctrl+\)" style={{ WebkitAppRegion: "no-drag" } as any}>
        <SplitSquareHorizontal size={16} />
      </button>

      {/* Command palette trigger */}
      <button onClick={onOpenCommandPalette} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors text-[var(--text-secondary)]" title="Command Palette (Ctrl+Shift+Space)" style={{ WebkitAppRegion: "no-drag" } as any}>
        <Command size={16} />
      </button>

      {/* Active tab URL hint */}
      {snap.split_tab_id && (
        <span className="text-[10px] text-[var(--text-secondary)] px-2 py-1 rounded bg-white/5 flex-shrink-0">Split: {getHost(activeTab.url)}</span>
      )}
    </div>
  );
}

