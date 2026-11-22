import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Monitor,
  Globe,
  Folder,
  Plus,
  Settings,
  Cpu,
  Maximize2,
  Minus,
  X,
} from "lucide-react";

function App() {
  const [appInfo, setAppInfo] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke("get_app_info")
      .then((info) => {
        setAppInfo(info as Record<string, unknown>);
      })
      .catch((e) => {
        console.error("Backend health check failed:", e);
        setError(String(e));
      });
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Title bar */}
      <div className="h-10 flex items-center justify-between px-3 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] select-none" style={{ WebkitAppRegion: "drag" } as any}>
        <div className="flex items-center gap-2">
          <Monitor size={16} className="text-[var(--accent)]" />
          <span className="text-sm font-medium tracking-wide">Parikaram</span>
        </div>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as any}>
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/5 transition-colors"><Minus size={14} /></button>
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/5 transition-colors"><Maximize2 size={14} /></button>
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/20 hover:text-red-400 transition-colors"><X size={14} /></button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Vertical sidebar rail */}
        <div className="w-[52px] flex flex-col items-center py-3 gap-1 bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] z-10">
          <button className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors" title="Spaces"><Folder size={18} /></button>
          <div className="w-5 border-t border-[var(--border-subtle)] my-1" />
          <button className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors text-[var(--accent)]" title="Browser"><Globe size={18} /></button>
          <button className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors" title="Notes"><Plus size={18} /></button>
          <div className="flex-1" />
          <button className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors text-[var(--text-secondary)]" title="Settings"><Settings size={18} /></button>
        </div>
        {/* Center content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* URL / command bar */}
          <div className="h-12 flex items-center px-4 gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/50">
            <div className="flex-1 h-8 rounded-md glass flex items-center px-3 text-sm text-[var(--text-secondary)]">
              <span>Search or enter address</span>
            </div>
          </div>

          {/* Canvas area */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-lg mx-auto mt-20 text-center">
              <Monitor size={48} className="mx-auto mb-4 text-[var(--accent)] opacity-60" />
              <h1 className="text-2xl font-semibold mb-2">Welcome to Parikaram</h1>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Native desktop browser &amp; spatial AI work environment.
              </p>

              {/* Rust backend health */}
              <div className="glass rounded-lg p-4 text-left">
                <div className="flex items-center gap-2 mb-3">
                  <Cpu size={16} className="text-[var(--accent)]" />
                  <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Backend Health</span>
                </div>
                {error ? (
                  <p className="text-red-400 text-sm">{error}</p>
                ) : appInfo ? (
                  <pre className="text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap">
                    {JSON.stringify(appInfo, null, 2)}
                  </pre>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)] animate-pulse">Connecting to Rust backend...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
