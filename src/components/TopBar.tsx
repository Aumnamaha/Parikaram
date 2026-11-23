import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, ArrowRight, RotateCw, Search, SplitSquareHorizontal, Command, ShieldCheck, ShieldOff, Bot, Layers, Grid3X3 } from "lucide-react";
import type { BrowserSnapshot } from "../types/browser";
import type { ShieldStatus, BlockedEvent } from "../types/store";

interface TopBarProps {
  snap: BrowserSnapshot | null;
  onRefresh: () => void;
  onToggleSplit: () => void;
  onOpenCommandPalette: () => void;
  onToggleAiSidebar?: () => void;
  shieldStatus?: ShieldStatus | null;
  onShieldPopoverToggle: (open: boolean) => void;
  workMode?: boolean;
  onToggleWorkMode?: () => void;
}

function getHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function TopBar({ snap, onRefresh, onToggleSplit, onOpenCommandPalette, onToggleAiSidebar, shieldStatus, onShieldPopoverToggle, workMode, onToggleWorkMode }: TopBarProps) {
  const [omniboxValue, setOmniboxValue] = useState("");
  const omniboxRef = useRef<HTMLInputElement>(null);
  const [shieldOpen, setShieldOpen] = useState(false);

  // Update shield status from parent
  useEffect(() => {
    if (shieldStatus) onShieldPopoverToggle(shieldOpen && shieldOpen);
  }, [shieldStatus]);

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

  const activeDomain = getHost(activeTab.url);
  const shieldEnabled = shieldStatus?.enabled ?? true;
  const domainShieldEnabled = shieldStatus?.active_domain_enabled ?? true;
  const totalBlocked = shieldStatus?.total_blocked ?? 0;
  const showShield = shieldEnabled && domainShieldEnabled;

  const handleGlobalToggle = async () => {
    await invoke("toggle_global_shield", { activeUrl: activeTab.url, activeTabId: snap.active_tab_id })
      .then(onRefresh).catch(console.error);
  };

  const handleDomainToggle = async () => {
    if (!shieldStatus) return;
    await invoke("toggle_domain_shield", { domain: activeDomain, activeUrl: activeTab.url, activeTabId: snap.active_tab_id })
      .then(onRefresh).catch(console.error);
  };

  const handleAddCustomRule = async () => {
    // Add a rule for the current domain if it's not blocked
    await invoke("add_custom_filter_rule", { 
      rule: `||${activeDomain}^`, 
      activeUrl: activeTab.url, 
      activeTabId: snap.active_tab_id 
    }).then(onRefresh).catch(console.error);
  };

  const handleResetStats = async () => {
    await invoke("reset_shield_stats", { activeUrl: activeTab.url, activeTabId: snap.active_tab_id })
      .then(onRefresh).catch(console.error);
  };

  return (
    <div className="h-12 flex items-center gap-2 px-3 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)]">
      {/* Navigation controls */}
      <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as any}>
        <button onClick={() => snap.active_tab_id && invoke("go_back_tab", { tabId: snap.active_tab_id }).then(onRefresh).catch(console.error)} disabled={!true} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors disabled:opacity-30">
          <ArrowLeft size={16} />
        </button>
        <button onClick={() => snap.active_tab_id && invoke("go_forward_tab", { tabId: snap.active_tab_id }).then(onRefresh).catch(console.error)} disabled={!false} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors disabled:opacity-30">
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

      {/* Shields badge */}
      <div className="relative" style={{ WebkitAppRegion: "no-drag" } as any}>
        <button
          onClick={() => { setShieldOpen((p) => !p); onShieldPopoverToggle(!shieldOpen); }}
          title={showShield ? `Shields Up (${totalBlocked} blocked)` : "Shields Paused"}
          className={`w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors ${showShield ? "text-green-400" : "text-red-400"}`}
        >
          {showShield ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
        </button>
        {totalBlocked > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {totalBlocked > 99 ? "99+" : totalBlocked}
          </span>
        )}

        {/* Shield popover */}
        {shieldOpen && (
          <div className="absolute right-0 top-full mt-2 w-72 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
              {/* Global toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-primary)]">Parikaram Shields</span>
                <button onClick={handleGlobalToggle} className={`px-2 py-0.5 rounded text-xs ${shieldEnabled ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                  {shieldEnabled ? "ON" : "OFF"}
                </button>
              </div>

              {/* Per-site toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)] truncate max-w-40">{activeDomain || "(no domain)"}</span>
                <button onClick={handleDomainToggle} className={`px-2 py-0.5 rounded text-xs ${domainShieldEnabled ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                  {domainShieldEnabled ? "Shields ON" : "Shields PAUSED"}
                </button>
              </div>

              {/* Stats */}
              <div className="text-xs text-[var(--text-secondary)]">
                <span>Total blocked: {totalBlocked}</span>
                {" | "}
                <span>Custom rules: {shieldStatus?.custom_rules_count ?? 0}</span>
              </div>

              {/* Recent blocked */}
              {(shieldStatus?.recent_blocked?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-[var(--text-secondary)] flex items-center justify-between">
                    <span>Recently Blocked</span>
                    <button onClick={handleResetStats} className="text-red-400 hover:text-red-300 text-[10px]">Reset</button>
                  </div>
                  {(shieldStatus?.recent_blocked ?? []).slice(-5).reverse().map((evt: BlockedEvent, i: number) => (
                    <div key={i} className="text-[10px] text-[var(--text-secondary)] truncate bg-white/5 rounded px-2 py-1" title={evt.url}>
                      {evt.domain}
                    </div>
                  ))}
                </div>
              )}

              {/* Add custom rule */}
              <button onClick={handleAddCustomRule} className="w-full text-xs bg-white/5 hover:bg-white/10 rounded px-2 py-1.5 text-[var(--text-secondary)] transition-colors">
                + Block {activeDomain || "domain"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Split view toggle */}
      <button onClick={onToggleSplit} className={`w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors ${snap.split_tab_id ? "text-[var(--accent)]" : ""}`} title="Toggle split view (Ctrl+\)" style={{ WebkitAppRegion: "no-drag" } as any}>
        <SplitSquareHorizontal size={16} />
      </button>

      {/* AI Assistant toggle */}
      {onToggleAiSidebar && (
        <button onClick={onToggleAiSidebar} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors text-violet-400" title="AI Assistant (Ctrl+E)" style={{ WebkitAppRegion: "no-drag" } as any}>
          <Bot size={16} />
        </button>
      )}

      {/* Command palette trigger */}
      <button onClick={onOpenCommandPalette} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors text-[var(--text-secondary)]" title="Command Palette (Ctrl+Shift+Space)" style={{ WebkitAppRegion: "no-drag" } as any}>
        <Command size={16} />
      </button>

      {/* Work Canvas mode toggle */}
      {onToggleWorkMode && (
        <div className="flex items-center rounded-lg border overflow-hidden" style={{ WebkitAppRegion: "no-drag" } as any}>
          <button onClick={() => workMode && onToggleWorkMode()} className={`px-2 py-1 text-[10px] transition-colors ${!workMode ? "bg-[var(--accent)]/20 text-[var(--accent)] font-medium" : "text-[var(--text-secondary)] hover:bg-white/5"}`} title="Browser Mode">
            <Layers size={12} />
          </button>
          <div className="w-px h-4 bg-[var(--border-subtle)]" />
          <button onClick={() => !workMode && onToggleWorkMode()} className={`px-2 py-1 text-[10px] transition-colors ${workMode ? "bg-violet-500/20 text-violet-400 font-medium" : "text-[var(--text-secondary)] hover:bg-white/5"}`} title="Spatial Work Canvas (Ctrl+Shift+W)">
            <Grid3X3 size={12} />
          </button>
        </div>
      )}

      {/* Active tab URL hint / mode indicator */}
      {snap.split_tab_id && (
        <span className="text-[10px] text-[var(--text-secondary)] px-2 py-1 rounded bg-white/5 flex-shrink-0">Split: {getHost(activeTab.url)}</span>
      )}
      {workMode && <span className="text-[10px] text-violet-400 px-2 py-1 rounded bg-violet-500/10 flex-shrink-0 font-medium">Work Canvas</span>}
    </div>
  );
}
