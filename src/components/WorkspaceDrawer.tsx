import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, X, Plus, Trash2, Check, Clock } from "lucide-react";
import type { HistoryEntry, NoteEntry, TaskEntry, DrawerTab } from "../types/store";

interface WorkspaceDrawerProps {
  open: boolean;
  activeTab: DrawerTab;
  onClose: () => void;
  onTabChange: (tab: DrawerTab) => void;
}

export function WorkspaceDrawer({ open, activeTab, onClose, onTabChange }: WorkspaceDrawerProps) {
  if (!open) return null;

  return (
    <div className="w-80 flex-shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col overflow-hidden" style={{ WebkitAppRegion: "no-drag" } as any}>
      {/* Header with tabs */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-[var(--border-subtle)]">
        {(["history", "notes", "tasks"] as DrawerTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
              activeTab === tab ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-white/5"
            }`}
          >
            {tab}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/5 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "history" && <HistoryPanel />}
        {activeTab === "notes" && <NotesPanel />}
        {activeTab === "tasks" && <TasksPanel />}
      </div>
    </div>
  );
}

/* ---- History Panel ---- */
function HistoryPanel() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    try {
      const result = await invoke("search_history", { query: "", limit: 50 });
      setHistory(result as HistoryEntry[]);
    } catch (e) { console.error("Failed to load history:", e); }
  };

  const search = async (q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await invoke("search_history", { query: q, limit: 50 });
        setHistory(result as HistoryEntry[]);
      } catch (e) { console.error("Search failed:", e); }
      setLoading(false);
    }, 150);
  };

  const handleNavigate = async (url: string) => {
    try { await invoke("navigate_tab", { tabId: "active-placeholder", input: url }); } catch {}
  };

  const clearAll = async () => {
    await invoke("clear_history").then(loadHistory).catch(console.error);
  };

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
            placeholder="Search history..."
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md outline-none focus:border-[var(--accent)]" />
        </div>
        <button onClick={clearAll} className="px-2 py-1.5 text-[10px] bg-red-500/10 text-red-400 rounded-md hover:bg-red-500/20 transition-colors">Clear</button>
      </div>

      {loading && <div className="text-xs text-[var(--text-secondary)] py-4 text-center">Searching...</div>}

      {!loading && history.map((h) => (
        <button key={h.id} onClick={() => handleNavigate(h.url)}
          className="w-full flex items-start gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors text-left">
          <div className="flex-shrink-0 w-6 h-6 rounded bg-[var(--accent)]/10 flex items-center justify-center mt-0.5">
            <Clock size={12} className="text-[var(--accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">{h.title}</div>
            <div className="text-[10px] text-[var(--text-secondary)] truncate">{h.url}</div>
          </div>
          <span className="flex-shrink-0 text-[9px] bg-white/5 px-1.5 py-0.5 rounded-full mt-0.5">{h.visit_count}v</span>
        </button>
      ))}

      {!loading && history.length === 0 && (
        <div className="text-xs text-[var(--text-secondary)] py-8 text-center">No history yet</div>
      )}
    </div>
  );
}

/* ---- Notes Panel ---- */
function NotesPanel() {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => { loadNotes(); }, []);

  const loadNotes = async () => {
    try { setNotes((await invoke("list_notes")) as NoteEntry[]); } catch (e) { console.error(e); }
  };

  const selectNote = (note: NoteEntry) => { setSelectedId(note.id); setTitle(note.title); setContent(note.content); };

  const createNote = async () => {
    const result = await invoke("upsert_note", { id: null, title: "Untitled", content: "" });
    setNotes(result as NoteEntry[]);
    const newNote = (result as NoteEntry[])[0];
    selectNote(newNote);
  };

  const saveNote = async () => {
    if (!selectedId || !title.trim()) return;
    await invoke("upsert_note", { id: selectedId, title, content }).then(loadNotes).catch(console.error);
  };

  const deleteNote = async (id: string) => {
    await invoke("delete_note", { id }).then(() => { setNotes((prev) => prev.filter((n) => n.id !== id)); if (selectedId === id) setSelectedId(null); }).catch(console.error);
  };

  return (
    <div className="p-3 space-y-2">
      <button onClick={createNote} className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-[var(--accent)]/10 text-[var(--accent)] rounded-md hover:bg-[var(--accent)]/20 transition-colors border border-[var(--accent)]/20">
        <Plus size={12} /> New Note
      </button>

      {notes.map((n) => (
        <div key={n.id} onClick={() => selectNote(n)} className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${selectedId === n.id ? "bg-[var(--accent)]/10" : "hover:bg-white/5"}`}>
          <span className="truncate">{n.title || "Untitled"}</span>
          <X size={12} onClick={(e) => { e.stopPropagation(); deleteNote(n.id); }} className="opacity-40 hover:!opacity-100 flex-shrink-0 cursor-pointer" />
        </div>
      ))}

      {selectedId && (
        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title..."
            className="w-full px-2 py-1.5 text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md outline-none focus:border-[var(--accent)]" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} placeholder="Write your note..."
            className="w-full px-2 py-1.5 text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md outline-none focus:border-[var(--accent)] resize-none" />
          <button onClick={saveNote} className="w-full px-2 py-1.5 text-xs bg-[var(--accent)]/20 text-[var(--accent)] rounded-md hover:bg-[var(--accent)]/30 transition-colors">Save Note</button>
        </div>
      )}

      {notes.length === 0 && !selectedId && (
        <div className="text-xs text-[var(--text-secondary)] py-8 text-center">No notes yet. Create one above.</div>
      )}
    </div>
  );
}

/* ---- Tasks Panel ---- */
function TasksPanel() {
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [dueLabel, setDueLabel] = useState("");

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    try { setTasks((await invoke("list_tasks")) as TaskEntry[]); } catch (e) { console.error(e); }
  };

  const addTask = async () => {
    if (!newTitle.trim()) return;
    await invoke("upsert_task", { id: null, title: newTitle.trim(), dueLabel: dueLabel || undefined })
      .then(loadTasks).catch(console.error);
    setNewTitle("");
    setDueLabel("");
  };

  const toggleTask = async (id: string) => {
    await invoke("toggle_task", { id }).then(loadTasks).catch(console.error);
  };

  const deleteTask = async (id: string) => {
    await invoke("delete_task", { id }).then(loadTasks).catch(console.error);
  };

  return (
    <div className="p-3 space-y-2">
      <div className="space-y-1.5">
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add a task..."
          onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
          className="w-full px-2 py-1.5 text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md outline-none focus:border-[var(--accent)]" />
        <div className="flex gap-1">
          <input value={dueLabel} onChange={(e) => setDueLabel(e.target.value)} placeholder="Due label..."
            onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
            className="flex-1 px-2 py-1 text-[10px] bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md outline-none focus:border-[var(--accent)]" />
          <button onClick={addTask} className="px-2 py-1.5 text-xs bg-[var(--accent)]/20 text-[var(--accent)] rounded-md hover:bg-[var(--accent)]/30 transition-colors">Add</button>
        </div>
      </div>

      {tasks.map((t) => (
        <div key={t.id} className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${t.completed ? "opacity-50" : ""}`}>
          <button onClick={() => toggleTask(t.id)} className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${t.completed ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--text-secondary)] hover:border-[var(--accent)]"}`}>
            {t.completed && <Check size={10} className="text-white" />}
          </button>
          <div className="min-w-0 flex-1">
            <span className={`text-xs ${t.completed ? "line-through" : ""}`}>{t.title}</span>
            {t.due_label && <span className="text-[9px] text-[var(--text-secondary)] ml-1">{t.due_label}</span>}
          </div>
          <Trash2 size={12} onClick={() => deleteTask(t.id)} className="opacity-40 hover:!opacity-100 flex-shrink-0 cursor-pointer" />
        </div>
      ))}

      {tasks.length === 0 && (
        <div className="text-xs text-[var(--text-secondary)] py-8 text-center">No tasks yet. Add one above.</div>
      )}
    </div>
  );
}
