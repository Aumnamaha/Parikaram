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
    <div className="h-11 flex shrink-0 items-center gap-1.5 bg-[#0b0d13]/95 border-b border-white/[0.06] px-2 backdrop-blur-sm">
      {/* Navigation controls — compact pill buttons */}
      <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as any}>
        <button onClick={() => hasActiveTab && invoke("go_back_tab", { tabId: snap!.active_tab_id! }).then(onRefresh).catch(console.error)} disabled={!isReady} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.06] transition-colors disabled:opacity-25">
          <ArrowLeft size={14} />
        </button>
        <button onClick={() => hasActiveTab && invoke("go_forward_tab", { tabId: snap!.active_tab_id! }).then(onRefresh).catch(console.error)} disabled={!isReady} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.06] transition-colors disabled:opacity-25">
          <ArrowRight size={14} />
        </button>
        <button onClick={() => hasActiveTab && invoke("reload_tab", { tabId: snap!.active_tab_id! }).then(onRefresh).catch(console.error)} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.06] transition-colors">
          <RotateCw size={14} />
        </button>
      </div>

      {/* Omnibox — centered pill with proper icon padding (pl-9 prevents overlap) */}
      <form onSubmit={handleSubmit} className="flex-1" style={{ WebkitAppRegion: "no-drag" } as any}>
        <div className="relative flex items-center rounded-lg bg-white/[0.04] border border-white/[0.08] focus-within:border-indigo-500/60 transition-all">
          <Search size={14} className="pointer-events-none absolute left-3 text-zinc-500" />
          <input ref={omniboxRef} type="text" value={omniboxValue} onChange={(e) => setOmniboxValue(e.target.value)} onBlur={() => handleNavigate(omniboxValue.trim())} onKeyDown={(e) => { if (e.key === "Enter") handleNavigate((e.target as HTMLInputElement).value); }} className="w-full bg-transparent py-1.5 pl-9 pr-24 text-[13px] outline-none placeholder:text-zinc-600" placeholder={isReady ? "Search or enter URL" : "Parikaram"} />
          {/* Domain security pill */}
          {activeTab && isReady && (
            <span className="absolute right-3 flex items-center gap-1 text-[10px] text-zinc-500">
              {activeUrl.startsWith("https") ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span className="hidden sm:inline">HTTPS</span>
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </>
              )}
            </span>
          )}
        </div>
      </form>

      {/* Shields badge — green/amber pill */}
      <div className="relative" style={{ WebkitAppRegion: "no-drag" } as any}>
        <button
          onClick={() => { setShieldOpen((p) => !p); onShieldPopoverToggle(!shieldOpen); }}
          title={showShield ? `Shields Up (${totalBlocked} blocked)` : "Shields Paused"}
          className={`flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-medium transition-colors ${showShield ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"} hover:bg-white/[0.06]`}
        >
          {showShield ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
          {totalBlocked > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">{totalBlocked > 99 ? "99+" : totalBlocked}</span>
          )}
        </button>

        {/* Shield popover */}
        {shieldOpen && (
          <div className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0e1118]/98 backdrop-blur-xl shadow-2xl">
            <div className="max-h-80 space-y-3 overflow-y-auto p-3">
              {/* Global toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-200">Parikaram Shields</span>
                <button onClick={handleGlobalToggle} className={`rounded px-2 py-0.5 text-[10px] ${shieldEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                  {shieldEnabled ? "ON" : "OFF"}
                </button>
              </div>

              {/* Per-site toggle */}
              <div className="flex items-center justify-between">
                <span className="truncate max-w-40 text-[11px] text-zinc-500">{activeDomain || "(no domain)"}</span>
                <button onClick={handleDomainToggle} className={`rounded px-2 py-0.5 text-[10px] ${domainShieldEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                  {domainShieldEnabled ? "Shields ON" : "PAUSED"}
                </button>
              </div>

              {/* Stats */}
              <div className="text-[11px] text-zinc-500">
                Blocked: {totalBlocked} · Rules: {shieldStatus?.custom_rules_count ?? 0}
              </div>

              {/* Recent blocked */}
              {(shieldStatus?.recent_blocked?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-medium text-zinc-500">
                    <span>Recently Blocked</span>
                    <button onClick={handleResetStats} className="text-red-400 hover:text-red-300">Reset</button>
                  </div>
                  {(shieldStatus?.recent_blocked ?? []).slice(-5).reverse().map((evt: BlockedEvent, i: number) => (
                    <div key={i} className="truncate rounded bg-white/[0.04] px-2 py-1 text-[10px] text-zinc-600" title={evt.url}>
                      {evt.domain}
                    </div>
                  ))}
                </div>
              )}

              {/* Add custom rule */}
              <button onClick={handleAddCustomRule} className="w-full rounded px-2 py-1.5 text-[10px] text-zinc-500 transition-colors bg-white/[0.04] hover:bg-white/[0.08]">
                + Block {activeDomain || "domain"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Split view toggle */}
      <button onClick={onToggleSplit} className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.06] transition-colors ${snap?.split_tab_id ? "text-indigo-400" : ""}`} title="Toggle split view (Ctrl+\)" style={{ WebkitAppRegion: "no-drag" } as any}>
        <SplitSquareHorizontal size={14} />
      </button>

      {/* AI Assistant toggle */}
      {onToggleAiSidebar && (
        <button onClick={onToggleAiSidebar} className="flex h-7 w-7 items-center justify-center rounded-md text-violet-400 hover:bg-white/[0.06] transition-colors" title="AI Assistant (Ctrl+E)" style={{ WebkitAppRegion: "no-drag" } as any}>
          <Bot size={14} />
        </button>
      )}

      {/* Command palette trigger */}
      <button onClick={onOpenCommandPalette} className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-white/[0.06] transition-colors" title="Command Palette (Ctrl+Shift+Space)" style={{ WebkitAppRegion: "no-drag" } as any}>
        <Command size={14} />
      </button>

      {/* Work Canvas mode toggle — segmented pill */}
      {onToggleWorkMode && (
        <div className="flex overflow-hidden rounded-md border border-white/[0.06]" style={{ WebkitAppRegion: "no-drag" } as any}>
          <button onClick={() => workMode && onToggleWorkMode()} className={`px-2 py-1 text-[9px] transition-colors ${!workMode ? "bg-indigo-500/15 text-indigo-400 font-medium" : "text-zinc-600 hover:bg-white/[0.04]"}`} title="Browser Mode">
            <Layers size={12} />
          </button>
          <div className="h-3.5 w-px bg-white/[0.06]" />
          <button onClick={() => !workMode && onToggleWorkMode()} className={`px-2 py-1 text-[9px] transition-colors ${workMode ? "bg-violet-500/15 font-medium text-violet-400" : "text-zinc-600 hover:bg-white/[0.04]"}`} title="Spatial Work Canvas (Ctrl+Shift+W)">
            <Grid3X3 size={12} />
          </button>
        </div>
      )}

      {/* Mode indicator */}
      {snap?.split_tab_id && isReady && (
        <span className="shrink-0 rounded bg-white/[0.04] px-2 py-0.5 text-[9px] text-zinc-600">Split</span>
      )}
      {workMode && <span className="shrink-0 rounded bg-violet-500/10 px-2 py-0.5 text-[9px] font-medium text-violet-400">Canvas</span>}
    </div>
  );
}
