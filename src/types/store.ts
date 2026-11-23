/** TypeScript interfaces matching src-tauri/src/store.rs serde structs */

export interface ProfileRecord {
  id: string;
  name: string;
  accent_color: string;
  created_at: number;
}

export interface HistoryEntry {
  id: number;
  profile_id: string;
  url: string;
  title: string;
  visit_count: number;
  visited_at: number;
}

export interface BookmarkEntry {
  id: string;
  profile_id: string;
  space_id: string | null;
  title: string;
  url: string;
  created_at: number;
}

export interface NoteEntry {
  id: string;
  profile_id: string;
  title: string;
  content: string;
  updated_at: number;
}

export interface TaskEntry {
  id: string;
  profile_id: string;
  title: string;
  completed: boolean;
  due_label: string | null;
  created_at: number;
}

export type DrawerTab = "history" | "notes" | "tasks";
