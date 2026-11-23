import { useState, useRef, useEffect } from "react";
import { ChevronDown, UserPlus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { ProfileRecord } from "../types/store";

interface ProfileSwitcherProps {
  profiles: ProfileRecord[];
  activeProfileId: string;
  onSwitch: (profileId: string) => void;
  onCreateNew: () => void;
  onPopoverOpenChange: (open: boolean) => void;
}

export function ProfileSwitcher({
  profiles,
  activeProfileId,
  onSwitch,
  onCreateNew,
  onPopoverOpenChange,
}: ProfileSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowCreate(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await invoke("create_profile", { name: newName.trim(), accentColor: "#6366f1" })
      .then(() => { setNewName(""); setShowCreate(false); onPopoverOpenChange(false); })
      .catch(console.error);
  };

  const handleSwitch = async (profileId: string) => {
    setIsOpen(false);
    setShowCreate(false);
    await invoke("switch_profile", { profileId })
      .then(() => { onSwitch(profileId); onPopoverOpenChange(false); })
      .catch(console.error);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => { setIsOpen((p) => !p); onPopoverOpenChange(!isOpen); }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <div
          className="w-6 h-6 rounded-full flex-shrink-0 border border-white/10"
          style={{ backgroundColor: activeProfile?.accent_color || "#6366f1" }}
        />
        <span className="text-xs font-medium truncate flex-1 text-left">
          {activeProfile?.name || "Default"}
        </span>
        <ChevronDown size={12} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full left-3 mb-2 w-56 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-xl overflow-hidden z-50"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          <div className="max-h-48 overflow-y-auto py-1">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSwitch(p.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors ${
                  p.id === activeProfileId ? "bg-[var(--accent)]/10 text-[var(--accent)]" : ""
                }`}
              >
                <div className="w-4 h-4 rounded-full flex-shrink-0 border border-white/10" style={{ backgroundColor: p.accent_color }} />
                <span className="truncate">{p.name}</span>
                {p.id === activeProfileId && <span className="ml-auto text-[10px] opacity-50">Active</span>}
              </button>
            ))}
          </div>

          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors border-t border-[var(--border-subtle)]">
              <UserPlus size={12} /> New Profile
            </button>
          ) : (
            <div className="px-3 py-2 border-t border-[var(--border-subtle)] space-y-1.5">
              <input
                type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Profile name..."
                className="w-full px-2 py-1 text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md outline-none focus:border-[var(--accent)]"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} autoFocus
              />
              <div className="flex gap-1">
                <button onClick={handleCreate} className="px-2 py-0.5 text-xs bg-[var(--accent)]/20 text-[var(--accent)] rounded-md hover:bg-[var(--accent)]/30">Create</button>
                <button onClick={() => { setShowCreate(false); setNewName(""); }} className="px-2 py-0.5 text-xs bg-white/5 rounded-md hover:bg-white/10">Cancel</button>
              </div>
            </div>
          )}

          <button onClick={() => { onCreateNew(); onPopoverOpenChange(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] opacity-40 hover:opacity-70 transition-opacity border-t border-[var(--border-subtle)]">
            <UserPlus size={10} /> Quick create profile
          </button>
        </div>
      )}
    </div>
  );
}
