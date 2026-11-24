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

  const activeTab = snap?.tabs.find((t) => t.id === snap?.active_tab_id) ?? null;
  const activeUrl = activeTab?.url ?? "";
  const activeDomain = getHost(activeUrl);

  // Keep omnibox in sync with active tab URL
  useEffect(() => {
    if (activeTab && activeTab.url !== omniboxValue) {
      setOmniboxValue(activeTab.url);
    }
  }, [activeTab?.url]);

  const handleNavigate = async (input: string) => {
    if (!snap || !snap.active_tab_id) return;
    await invoke("navigate_tab", { tabId: snap.active_tab_id, input }).then(onRefresh).catch(console.error);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleNavigate(omniboxValue);
  };

  const shieldEnabled = shieldStatus?.enabled ?? true;
  const domainShieldEnabled = shieldStatus?.active_domain_enabled ?? true;
  const totalBlocked = shieldStatus?.total_blocked ?? 0;
  const showShield = shieldEnabled && domainShieldEnabled;

  const handleGlobalToggle = async () => {
    await invoke("toggle_global_shield", { activeUrl: activeTab?.url, activeTabId: snap?.active_tab_id })
      .then(onRefresh).catch(console.error);
  };

  const handleDomainToggle = async () => {
    if (!shieldStatus) return;
    await invoke("toggle_domain_shield", { domain: activeDomain, activeUrl: activeTab?.url, activeTabId: snap?.active_tab_id })
      .then(onRefresh).catch(console.error);
  };

  const handleAddCustomRule = async () => {
    await invoke("add_custom_filter_rule", { 
      rule: `||${activeDomain}^`, 
      activeUrl: activeTab?.url, 
      activeTabId: snap?.active_tab_id 
    }).then(onRefresh).catch(console.error);
  };

  const handleResetStats = async () => {
    await invoke("reset_shield_stats", { activeUrl: activeTab?.url, activeTabId: snap?.active_tab_id })
      .then(onRefresh).catch(console.error);
  };

  const hasActiveTab = !!snap && !!snap.active_tab_id;
  const isReady = hasActiveTab && activeTab !== null;

  return (
    <div className="h-12 flex shrink-0 items-center gap-2 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-3">
      {/* Navigation controls */}
      <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as any}>
        <button onClick={() => hasActiveTab && invoke("go_back_tab", { tabId: snap!.active_tab_id! }).then(onRefresh).catch(console.error)} disabled={!isReady} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors disabled:opacity-30">
          <ArrowLeft size={16} />
        </button>
        <button onClick={() => hasActiveTab && invoke("go_forward_tab", { tabId: snap!.active_tab_id! }).then(onRefresh).catch(console.error)} disabled={!isReady} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors disabled:opacity-30">
          <ArrowRight size={16} />
        </button>
        <button onClick={() => hasActiveTab && invoke("reload_tab", { tabId: snap!.active_tab_id! }).then(onRefresh).catch(console.error)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 transition-colors">
          <RotateCw size={16} />
        </button>
      </div>

      {/* Omnibox */}
      <form onSubmit={handleSubmit} className="flex-1" style={{ WebkitAppRegion: "no-drag" } as any}>
        <div className="relative flex items-center">
          <Search size={14} className="pointer-events-none absolute left-3 text-[var(--text-secondary)]" />
          <input ref={omniboxRef} type="text" value={omniboxValue} onChange={(e) => setOmniboxValue(e.target.value)} onBlur={() => handleNavigate(omniboxValue.trim())} onKeyDown={(e) => { if (e.key === "Enter") handleNavigate((e.target as HTMLInputElement).value); }} className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] py-1.5 pl-9 pr-4 text-sm outline-none transition-all focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-glow)]" placeholder={isReady ? "Search or enter URL" : "Parikaram — Loading..."} />
        </div>
      </form>

      {/* Shields badge */}
      <div className="relative" style={{ WebkitAppRegion: "no-drag" } as any}>
        <button
          onClick={() => { setShieldOpen((p) => !p); onShieldPopoverToggle(!shieldOpen); }}
          title={showShield ? `Shields Up (${totalBlocked} blocked)` : "Shields Paused"}
          className={`flex w-8 items-center justify-center rounded hover:bg-white/5 transition-colors h-8 ${showShield ? "text-green-400" : "text-red-400"}`}
        >
          {showShield ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
        </button>
        {totalBlocked > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {totalBlocked > 99 ? "99+" : totalBlocked}
          </span>
        )}

        {/* Shield popover */}
        {shieldOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] shadow-xl">
            <div className="max-h-80 space-y-3 overflow-y-auto p-3">
              {/* Global toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-primary)]">Parikaram Shields</span>
                <button onClick={handleGlobalToggle} className={`rounded px-2 py-0.5 text-xs ${shieldEnabled ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                  {shieldEnabled ? "ON" : "OFF"}
                </button>
              </div>

              {/* Per-site toggle */}
              <div className="flex items-center justify-between">
                <span className="truncate max-w-40 text-xs text-[var(--text-secondary)]">{activeDomain || "(no domain)"}</span>
                <button onClick={handleDomainToggle} className={`rounded px-2 py-0.5 text-xs ${domainShieldEnabled ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
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
                  <div className="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
                    <span>Recently Blocked</span>
                    <button onClick={handleResetStats} className="text-[10px] text-red-400 hover:text-red-300">Reset</button>
                  </div>
                  {(shieldStatus?.recent_blocked ?? []).slice(-5).reverse().map((evt: BlockedEvent, i: number) => (
                    <div key={i} className="truncate rounded bg-white/5 px-2 py-1 text-[10px] text-[var(--text-secondary)]" title={evt.url}>
                      {evt.domain}
                    </div>
                  ))}
                </div>
              )}

              {/* Add custom rule */}
              <button onClick={handleAddCustomRule} className="w-full rounded px-2 py-1.5 text-xs text-[var(--text-secondary)] transition-colors bg-white/5 hover:bg-white/10">
                + Block {activeDomain || "domain"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Split view toggle */}
      <button onClick={onToggleSplit} className={`flex h-8 w-8 items-center justify-center rounded hover:bg-white/5 transition-colors ${snap?.split_tab_id ? "text-[var(--accent)]" : ""}`} title="Toggle split view (Ctrl+\)" style={{ WebkitAppRegion: "no-drag" } as any}>
        <SplitSquareHorizontal size={16} />
      </button>

      {/* AI Assistant toggle */}
      {onToggleAiSidebar && (
        <button onClick={onToggleAiSidebar} className="flex h-8 w-8 items-center justify-center rounded text-violet-400 hover:bg-white/5 transition-colors" title="AI Assistant (Ctrl+E)" style={{ WebkitAppRegion: "no-drag" } as any}>
          <Bot size={16} />
        </button>
      )}

      {/* Command palette trigger */}
      <button onClick={onOpenCommandPalette} className="flex h-8 w-8 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-white/5 transition-colors" title="Command Palette (Ctrl+Shift+Space)" style={{ WebkitAppRegion: "no-drag" } as any}>
        <Command size={16} />
      </button>

      {/* Work Canvas mode toggle */}
      {onToggleWorkMode && (
        <div className="flex overflow-hidden rounded-lg border" style={{ WebkitAppRegion: "no-drag" } as any}>
          <button onClick={() => workMode && onToggleWorkMode()} className={`px-2 py-1 text-[10px] transition-colors ${!workMode ? "bg-[var(--accent)]/20 font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-white/5"}`} title="Browser Mode">
            <Layers size={12} />
          </button>
          <div className="h-4 w-px bg-[var(--border-subtle)]" />
          <button onClick={() => !workMode && onToggleWorkMode()} className={`px-2 py-1 text-[10px] transition-colors ${workMode ? "bg-violet-500/20 font-medium text-violet-400" : "text-[var(--text-secondary)] hover:bg-white/5"}`} title="Spatial Work Canvas (Ctrl+Shift+W)">
            <Grid3X3 size={12} />
          </button>
        </div>
      )}

      {/* Mode indicator */}
      {snap?.split_tab_id && isReady && (
        <span className="shrink-0 rounded bg-white/5 px-2 py-1 text-[10px] text-[var(--text-secondary)]">Split: {activeDomain}</span>
      )}
      {workMode && <span className="shrink-0 rounded bg-violet-500/10 px-2 py-1 text-[10px] font-medium text-violet-400">Work Canvas</span>}
    </div>
  );
}
