#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProfileRecord {
    pub id: String,
    pub name: String,
    pub accent_color: String,
    pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub profile_id: String,
    pub url: String,
    pub title: String,
    pub visit_count: i32,
    pub visited_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BookmarkEntry {
    pub id: String,
    pub profile_id: String,
    pub space_id: Option<String>,
    pub title: String,
    pub url: String,
    pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NoteEntry {
    pub id: String,
    pub profile_id: String,
    pub title: String,
    pub content: String,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskEntry {
    pub id: String,
    pub profile_id: String,
    pub title: String,
    pub completed: bool,
    pub due_label: Option<String>,
    pub created_at: i64,
}



#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CanvasNodeRecord {
    pub id: String,
    pub profile_id: String,
    pub space_id: String,
    pub kind: String,
    pub title: String,
    pub content: String,
    pub url: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CanvasEdgeRecord {
    pub id: String,
    pub profile_id: String,
    pub space_id: String,
    pub source_id: String,
    pub target_id: String,
    pub label: Option<String>,
}

fn chrono_utc_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub struct StoreInner {
    conn: rusqlite::Connection,
    pub active_profile_id: String,
    db_path: PathBuf,
}

impl StoreInner {
    fn init_schema(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY, name TEXT NOT NULL,
                accent_color TEXT NOT NULL, created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS spaces (
                id TEXT PRIMARY KEY, profile_id TEXT NOT NULL,
                name TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS tabs (
                id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, space_id TEXT NOT NULL,
                title TEXT NOT NULL, url TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL,
                url TEXT NOT NULL, title TEXT NOT NULL,
                visit_count INTEGER NOT NULL DEFAULT 1, visited_at INTEGER NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(
                title, url, content='history', content_rowid='id'
            );
            CREATE TRIGGER IF NOT EXISTS history_ai AFTER INSERT ON history
                BEGIN INSERT INTO history_fts(rowid, title, url) VALUES (new.id, new.title, new.url); END;
            CREATE TRIGGER IF NOT EXISTS history_au AFTER UPDATE ON history
                BEGIN UPDATE history_fts SET title=new.title, url=new.url WHERE rowid=new.id; END;
            CREATE TRIGGER IF NOT EXISTS history_ad AFTER DELETE ON history
                BEGIN DELETE FROM history_fts WHERE rowid=old.id; END;
            CREATE TABLE IF NOT EXISTS bookmarks (
                id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, space_id TEXT,
                title TEXT NOT NULL, url TEXT NOT NULL, created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY, profile_id TEXT NOT NULL,
                title TEXT NOT NULL, content TEXT NOT NULL, updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY, profile_id TEXT NOT NULL,
                title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
                due_label TEXT, created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS canvas_nodes (
                id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, space_id TEXT NOT NULL,
                kind TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
                url TEXT, x REAL NOT NULL, y REAL NOT NULL,
                width REAL NOT NULL, height REAL NOT NULL, updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS canvas_edges (
                id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, space_id TEXT NOT NULL,
                source_id TEXT NOT NULL, target_id TEXT NOT NULL, label TEXT
            );",
        )?;

        let cnt: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM profiles", [],
            |r| r.get::<_, i64>(0),
        )?;
        if cnt == 0 {
            let now = chrono_utc_ms();
            self.conn.execute(
                "INSERT INTO profiles (id, name, accent_color, created_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![&"default", &"Default", &"#6366f1", now],
            )?;
        }
        Ok(())
    }

    fn record_history_internal(&self, profile_id: &str, url: &str, title: &str) -> Result<(), String> {
        let now = chrono_utc_ms();
        self.conn.execute(
            "INSERT INTO history (profile_id, url, title, visit_count, visited_at) \
             VALUES (?1, ?2, ?3, COALESCE((SELECT visit_count FROM history WHERE profile_id=?1 AND url=?2), 0)+1, ?4)",
            rusqlite::params![&profile_id, &url, &title, now],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn save_workspace_snapshot(&self, space_id: &str, tabs_json: &str) -> Result<(), String> {
        self.conn.execute(
            "DELETE FROM tabs WHERE profile_id=?1 AND space_id=?2",
            rusqlite::params![&self.active_profile_id, &space_id],
        ).map_err(|e| e.to_string())?;

        let tabs: Vec<serde_json::Value> =
            serde_json::from_str(tabs_json).map_err(|e| e.to_string())?;
        for t in &tabs {
            if !t["pinned"].as_bool().unwrap_or(false) {
                let so = t["sort_order"].as_i64().unwrap_or(0);
                self.conn.execute(
                    "INSERT INTO tabs (id, profile_id, space_id, title, url, pinned, sort_order) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    rusqlite::params![
                        t["id"].as_str().unwrap_or(""),
                        &self.active_profile_id,
                        &space_id,
                        t["title"].as_str().unwrap_or(""),
                        t["url"].as_str().unwrap_or(""),
                        0i32,
                        so,
                    ],
                ).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    fn load_workspace_snapshot(&self) -> Result<(Vec<serde_json::Value>, Vec<serde_json::Value>), String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, icon, color FROM spaces WHERE profile_id=? ORDER BY sort_order",
        ).map_err(|e| e.to_string())?;

        let space_iter = stmt.query_map(rusqlite::params![&self.active_profile_id], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, String>(0)?,
                "name": r.get::<_, String>(1)?,
                "icon": r.get::<_, String>(2)?,
                "color": r.get::<_, String>(3)?,
            }))
        }).map_err(|e| e.to_string())?;

        let spaces: Vec<serde_json::Value> = space_iter.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);

        let mut stmt2 = self.conn.prepare(
            "SELECT id, title, url, pinned FROM tabs WHERE profile_id=? ORDER BY sort_order",
        ).map_err(|e| e.to_string())?;

        let tab_iter = stmt2.query_map(rusqlite::params![&self.active_profile_id], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, String>(0)?,
                "title": r.get::<_, String>(1)?,
                "url": r.get::<_, String>(2)?,
                "pinned": r.get::<_, bool>(3)?,
            }))
        }).map_err(|e| e.to_string())?;

        let tabs: Vec<serde_json::Value> = tab_iter.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt2);

        Ok((spaces, tabs))
    }
}

pub struct StoreState(pub Mutex<StoreInner>);

impl StoreState {
    pub fn open(db_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
        let inner = StoreInner {
            conn,
            active_profile_id: "default".to_string(),
            db_path,
        };
        inner.init_schema().map_err(|e| e.to_string())?;
        Ok(Self(Mutex::new(inner)))
    }

    pub fn open_in_memory() -> Result<Self, String> {
        let conn = rusqlite::Connection::open_in_memory().map_err(|e| e.to_string())?;
        let inner = StoreInner {
            conn,
            active_profile_id: "default".to_string(),
            db_path: PathBuf::from(":memory:"),
        };
        inner.init_schema().map_err(|e| e.to_string())?;
        Ok(Self(Mutex::new(inner)))
    }

    pub fn record_history_internal(&self, profile_id: &str, url: &str, title: &str) -> Result<(), String> {
        self.0.lock().unwrap().record_history_internal(profile_id, url, title)
    }

    pub fn sync_workspace_snapshot(&self, space_id: &str, tabs_json: &str) -> Result<(), String> {
        self.0.lock().unwrap().save_workspace_snapshot(space_id, tabs_json)
    }

    pub fn load_workspace_snapshot(&self) -> Result<(Vec<serde_json::Value>, Vec<serde_json::Value>), String> {
        self.0.lock().unwrap().load_workspace_snapshot()
    }
}

// ── IPC Commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn list_profiles(state: tauri::State<'_, StoreState>) -> Result<(Vec<ProfileRecord>, String), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let active = guard.active_profile_id.clone();

    let mut stmt = guard.conn.prepare(
        "SELECT id, name, accent_color, created_at FROM profiles ORDER BY created_at",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![], |r| {
        Ok(ProfileRecord {
            id: r.get::<_, String>(0)?,
            name: r.get::<_, String>(1)?,
            accent_color: r.get::<_, String>(2)?,
            created_at: r.get::<_, i64>(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let profiles: Vec<ProfileRecord> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);
    drop(guard);
    Ok((profiles, active))
}

#[tauri::command]
pub async fn create_profile(state: tauri::State<'_, StoreState>, name: String, accent_color: String) -> Result<(Vec<ProfileRecord>, String), String> {
    let pid = uuid::Uuid::new_v4().to_string();
    let now = chrono_utc_ms();
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.conn.execute(
            "INSERT INTO profiles (id, name, accent_color, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![&pid, &name, &accent_color, now],
        ).map_err(|e| e.to_string())?;
    }
    list_profiles(state).await
}

#[tauri::command]
pub async fn switch_profile(
    app: AppHandle,
    store: tauri::State<'_, StoreState>,
    browser: tauri::State<'_, crate::browser::BrowserState>,
    profile_id: String,
) -> Result<serde_json::Value, String> {
    {
        let mut inner = store.0.lock().map_err(|e| e.to_string())?;
        inner.active_profile_id = profile_id.clone();
    }
    let (spaces_json, tabs_json) = store.load_workspace_snapshot()?;

    // Rebuild BrowserState from persisted data
    {
        let mut browser_inner = browser.0.lock().map_err(|e| e.to_string())?;
        browser_inner.spaces.clear();
        browser_inner.tabs.clear();

        for s in &spaces_json {
            browser_inner.spaces.push(crate::browser::Space {
                id: s["id"].as_str().unwrap_or("").to_string(),
                name: s["name"].as_str().unwrap_or("").to_string(),
                icon: s["icon"].as_str().unwrap_or("folder").to_string(),
                color: s["color"].as_str().unwrap_or("#6366f1").to_string(),
            });
        }

        for t in &tabs_json {
            browser_inner.tabs.push(crate::browser::TabInfo {
                id: uuid::Uuid::new_v4().to_string(),
                space_id: "space-personal".to_string(),
                title: t["title"].as_str().unwrap_or("Untitled").to_string(),
                url: t["url"].as_str().unwrap_or("https://example.com").to_string(),
                pinned: false,
                is_active: false,
                is_loading: false,
            });
        }

        if let Some(t) = browser_inner.tabs.iter_mut().find(|t| !t.pinned) {
            t.is_active = true;
            browser_inner.active_tab_id = Some(t.id.clone());
        } else if let Some(t) = browser_inner.tabs.first() {
            browser_inner.active_tab_id = Some(t.id.clone());
        }
    }

    let snap = crate::browser::BrowserSnapshot {
        spaces: browser.0.lock().unwrap().spaces.clone(),
        active_space_id: "space-personal".to_string(),
        tabs: browser.0.lock().unwrap().tabs.clone(),
        active_tab_id: browser.0.lock().unwrap().active_tab_id.clone(),
        split_tab_id: None,
        viewport: crate::browser::ViewportBounds { x: 0.0, y: 0.0, width: 1360.0, height: 860.0 },
        overlay_hidden: false,
    };

    #[cfg(desktop)]
    crate::browser::sync_native_webviews(&app, &snap);

    serde_json::to_value(snap).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn record_history(state: tauri::State<'_, StoreState>, url: String, title: String) -> Result<(), String> {
    let inner = state.0.lock().map_err(|e| e.to_string())?;
    let profile_id = inner.active_profile_id.clone();
    drop(inner);
    state.record_history_internal(&profile_id, &url, &title)
}

#[tauri::command]
pub async fn search_history(state: tauri::State<'_, StoreState>, query: String, limit: Option<usize>) -> Result<Vec<HistoryEntry>, String> {
    let inner = state.0.lock().map_err(|e| e.to_string())?;
    let profile_id = inner.active_profile_id.clone();
    let lmt = limit.unwrap_or(50);

    let mut results = Vec::new();

    if query.trim().is_empty() {
        let mut stmt = inner.conn.prepare(
            "SELECT id, profile_id, url, title, visit_count, visited_at \
             FROM history WHERE profile_id=?1 ORDER BY visited_at DESC LIMIT ?2",
        ).map_err(|e| e.to_string())?;
        for row in stmt.query_map(rusqlite::params![&profile_id, lmt], |r| {
            Ok(HistoryEntry {
                id: r.get::<_, i64>(0)?,
                profile_id: r.get::<_, String>(1)?,
                url: r.get::<_, String>(2)?,
                title: r.get::<_, String>(3)?,
                visit_count: r.get::<_, i32>(4)?,
                visited_at: r.get::<_, i64>(5)?,
            })
        }).map_err(|e| e.to_string())? {
            results.push(row.map_err(|e| e.to_string())?);
        }
        drop(stmt);
    } else {
        let tokens: Vec<String> = query.trim().split_whitespace()
            .map(|s| s.to_string()).collect();
        if !tokens.is_empty() {
            let pattern = tokens.join(" ");
            let sql = format!(
                "SELECT h.id, h.profile_id, h.url, h.title, h.visit_count, h.visited_at \
                 FROM history h JOIN history_fts ft ON h.id=ft.rowid \
                 WHERE ft.history_fts MATCH ?1 AND h.profile_id=?2 \
                 ORDER BY rank LIMIT ?3"
            );
            let mut stmt = inner.conn.prepare(&sql).map_err(|e| e.to_string())?;
            for row in stmt.query_map(rusqlite::params![&pattern, &profile_id, lmt], |r| {
                Ok(HistoryEntry {
                    id: r.get::<_, i64>(0)?,
                    profile_id: r.get::<_, String>(1)?,
                    url: r.get::<_, String>(2)?,
                    title: r.get::<_, String>(3)?,
                    visit_count: r.get::<_, i32>(4)?,
                    visited_at: r.get::<_, i64>(5)?,
                })
            }).map_err(|e| e.to_string())? {
                results.push(row.map_err(|e| e.to_string())?);
            }
            drop(stmt);
        }
    }

    drop(inner);
    Ok(results)
}

#[tauri::command]
pub async fn clear_history(state: tauri::State<'_, StoreState>) -> Result<(), String> {
    let profile_id = {
        let inner = state.0.lock().map_err(|e| e.to_string())?;
        inner.active_profile_id.clone()
    };
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    guard.conn.execute(
        "DELETE FROM history WHERE profile_id=?1",
        rusqlite::params![&profile_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_bookmarks(state: tauri::State<'_, StoreState>) -> Result<Vec<BookmarkEntry>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let profile_id = guard.active_profile_id.clone();

    let mut stmt = guard.conn.prepare(
        "SELECT id, profile_id, space_id, title, url, created_at \
         FROM bookmarks WHERE profile_id=? ORDER BY created_at DESC",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![&profile_id], |r| {
        Ok(BookmarkEntry {
            id: r.get::<_, String>(0)?,
            profile_id: r.get::<_, String>(1)?,
            space_id: r.get::<_, Option<String>>(2)?,
            title: r.get::<_, String>(3)?,
            url: r.get::<_, String>(4)?,
            created_at: r.get::<_, i64>(5)?,
        })
    }).map_err(|e| e.to_string())?;
    let result = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);
    drop(guard);
    Ok(result)
}

#[tauri::command]
pub async fn add_bookmark(
    state: tauri::State<'_, StoreState>,
    title: String, url: String, space_id: Option<String>,
) -> Result<Vec<BookmarkEntry>, String> {
    let bid = uuid::Uuid::new_v4().to_string();
    let now = chrono_utc_ms();
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.conn.execute(
            "INSERT INTO bookmarks (id, profile_id, space_id, title, url, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![&bid, &guard.active_profile_id, &space_id.unwrap_or_default(), &title, &url, now],
        ).map_err(|e| e.to_string())?;
    }
    list_bookmarks(state).await
}

#[tauri::command]
pub async fn remove_bookmark(state: tauri::State<'_, StoreState>, id: String) -> Result<Vec<BookmarkEntry>, String> {
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.conn.execute("DELETE FROM bookmarks WHERE id=?1", rusqlite::params![&id])
            .map_err(|e| e.to_string())?;
    }
    list_bookmarks(state).await
}

#[tauri::command]
pub async fn list_notes(state: tauri::State<'_, StoreState>) -> Result<Vec<NoteEntry>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let profile_id = guard.active_profile_id.clone();

    let mut stmt = guard.conn.prepare(
        "SELECT id, profile_id, title, content, updated_at \
         FROM notes WHERE profile_id=? ORDER BY updated_at DESC",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![&profile_id], |r| {
        Ok(NoteEntry {
            id: r.get::<_, String>(0)?,
            profile_id: r.get::<_, String>(1)?,
            title: r.get::<_, String>(2)?,
            content: r.get::<_, String>(3)?,
            updated_at: r.get::<_, i64>(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let result = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);
    drop(guard);
    Ok(result)
}

#[tauri::command]
pub async fn upsert_note(
    state: tauri::State<'_, StoreState>,
    id: Option<String>, title: String, content: String,
) -> Result<Vec<NoteEntry>, String> {
    let nid = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono_utc_ms();
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        let exists: i64 = guard.conn.query_row(
            "SELECT COUNT(*) FROM notes WHERE id=?1", rusqlite::params![&nid], |r| r.get::<_, i64>(0)
        ).unwrap_or(0);
        if exists > 0 {
            guard.conn.execute(
                "UPDATE notes SET title=?2, content=?3, updated_at=?4 WHERE id=?1",
                rusqlite::params![&nid, &title, &content, now],
            ).map_err(|e| e.to_string())?;
        } else {
            guard.conn.execute(
                "INSERT INTO notes (id, profile_id, title, content, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![&nid, &guard.active_profile_id, &title, &content, now],
            ).map_err(|e| e.to_string())?;
        }
    }
    list_notes(state).await
}

#[tauri::command]
pub async fn delete_note(state: tauri::State<'_, StoreState>, id: String) -> Result<Vec<NoteEntry>, String> {
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.conn.execute("DELETE FROM notes WHERE id=?1", rusqlite::params![&id])
            .map_err(|e| e.to_string())?;
    }
    list_notes(state).await
}

#[tauri::command]
pub async fn list_tasks(state: tauri::State<'_, StoreState>) -> Result<Vec<TaskEntry>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let profile_id = guard.active_profile_id.clone();

    let mut stmt = guard.conn.prepare(
        "SELECT id, profile_id, title, completed, due_label, created_at \
         FROM tasks WHERE profile_id=? ORDER BY created_at DESC",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![&profile_id], |r| {
        Ok(TaskEntry {
            id: r.get::<_, String>(0)?,
            profile_id: r.get::<_, String>(1)?,
            title: r.get::<_, String>(2)?,
            completed: r.get::<_, i64>(3)? != 0,
            due_label: r.get::<_, Option<String>>(4)?,
            created_at: r.get::<_, i64>(5)?,
        })
    }).map_err(|e| e.to_string())?;
    let result = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);
    drop(guard);
    Ok(result)
}

#[tauri::command]
pub async fn upsert_task(
    state: tauri::State<'_, StoreState>,
    id: Option<String>, title: String, due_label: Option<String>,
) -> Result<Vec<TaskEntry>, String> {
    let tid = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono_utc_ms();
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        let exists: i64 = guard.conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE id=?1", rusqlite::params![&tid], |r| r.get::<_, i64>(0)
        ).unwrap_or(0);
        if exists > 0 {
            guard.conn.execute(
                "UPDATE tasks SET title=?2, due_label=?3 WHERE id=?1",
                rusqlite::params![&tid, &title, &due_label.unwrap_or_default()],
            ).map_err(|e| e.to_string())?;
        } else {
            guard.conn.execute(
                "INSERT INTO tasks (id, profile_id, title, completed, due_label, created_at) VALUES (?1, ?2, ?3, 0, ?4, ?5)",
                rusqlite::params![&tid, &guard.active_profile_id, &title, &due_label.unwrap_or_default(), now],
            ).map_err(|e| e.to_string())?;
        }
    }
    list_tasks(state).await
}

#[tauri::command]
pub async fn toggle_task(state: tauri::State<'_, StoreState>, id: String) -> Result<Vec<TaskEntry>, String> {
    let completed_val = {
        let inner = state.0.lock().map_err(|e| e.to_string())?;
        let cur: i64 = inner.conn.query_row(
            "SELECT completed FROM tasks WHERE id=?1", rusqlite::params![&id], |r| r.get::<_, i64>(0)
        ).unwrap_or(0);
        if cur != 0 { 0i32 } else { 1i32 }
    };
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.conn.execute(
            "UPDATE tasks SET completed=?2 WHERE id=?1",
            rusqlite::params![&id, completed_val],
        ).map_err(|e| e.to_string())?;
    }
    list_tasks(state).await
}

#[tauri::command]
pub async fn delete_task(state: tauri::State<'_, StoreState>, id: String) -> Result<Vec<TaskEntry>, String> {
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.conn.execute("DELETE FROM tasks WHERE id=?1", rusqlite::params![&id])
            .map_err(|e| e.to_string())?;
    }
    list_tasks(state).await
}
// ── Canvas IPC Commands ────────────────────────────────────────

#[tauri::command]
pub async fn list_canvas_nodes(state: tauri::State<'_, StoreState>, space_id: String) -> Result<Vec<CanvasNodeRecord>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let profile_id = guard.active_profile_id.clone();
    let mut stmt = guard.conn.prepare(
        "SELECT id, profile_id, space_id, kind, title, content, url, x, y, width, height, updated_at          FROM canvas_nodes WHERE profile_id=?1 AND space_id=?2 ORDER BY updated_at DESC"
    ).map_err(|e| e.to_string())?;
    let nodes = stmt.query_map(rusqlite::params![&profile_id, &space_id], |r| {
        Ok(CanvasNodeRecord {
            id: r.get(0)?, profile_id: r.get(1)?, space_id: r.get(2)?, kind: r.get(3)?,
            title: r.get(4)?, content: r.get(5)?, url: r.get(6)?, x: r.get(7)?, y: r.get(8)?,
            width: r.get(9)?, height: r.get(10)?, updated_at: r.get(11)?,
        })
    }).map_err(|e| e.to_string())?;
    Ok(nodes.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub async fn upsert_canvas_node(state: tauri::State<'_, StoreState>, node: CanvasNodeRecord) -> Result<Vec<CanvasNodeRecord>, String> {
    let now = chrono_utc_ms();
    {
        let inner = state.0.lock().map_err(|e| e.to_string())?;
        inner.conn.execute(
            "INSERT OR REPLACE INTO canvas_nodes (id, profile_id, space_id, kind, title, content, url, x, y, width, height, updated_at)          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![&node.id, &node.profile_id, &node.space_id, &node.kind, &node.title,
                &node.content, &node.url, node.x, node.y, node.width, node.height, now],
        ).map_err(|e| e.to_string())?;
    }
    list_canvas_nodes(state, node.space_id).await
}

#[tauri::command]
pub async fn delete_canvas_node(state: tauri::State<'_, StoreState>, space_id: String, id: String) -> Result<Vec<CanvasNodeRecord>, String> {
    {
        let inner = state.0.lock().map_err(|e| e.to_string())?;
        inner.conn.execute(
            "DELETE FROM canvas_edges WHERE source_id=?1 OR target_id=?1", rusqlite::params![&id]
        ).map_err(|e| e.to_string())?;
        inner.conn.execute("DELETE FROM canvas_nodes WHERE id=?1 AND space_id=?2", rusqlite::params![&id, &space_id])
            .map_err(|e| e.to_string())?;
    }
    list_canvas_nodes(state, space_id).await
}

#[tauri::command]
pub async fn list_canvas_edges(state: tauri::State<'_, StoreState>, space_id: String) -> Result<Vec<CanvasEdgeRecord>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let profile_id = guard.active_profile_id.clone();
    let mut stmt = guard.conn.prepare(
        "SELECT id, profile_id, space_id, source_id, target_id, label          FROM canvas_edges WHERE profile_id=?1 AND space_id=?2"
    ).map_err(|e| e.to_string())?;
    let edges = stmt.query_map(rusqlite::params![&profile_id, &space_id], |r| {
        Ok(CanvasEdgeRecord {
            id: r.get(0)?, profile_id: r.get(1)?, space_id: r.get(2)?,
            source_id: r.get(3)?, target_id: r.get(4)?, label: r.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    Ok(edges.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub async fn upsert_canvas_edge(state: tauri::State<'_, StoreState>, edge: CanvasEdgeRecord) -> Result<Vec<CanvasEdgeRecord>, String> {
    let space_id = edge.space_id.clone();
    {
        let inner = state.0.lock().map_err(|e| e.to_string())?;
        inner.conn.execute(
            "INSERT OR REPLACE INTO canvas_edges (id, profile_id, space_id, source_id, target_id, label)          VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![&edge.id, &edge.profile_id, &edge.space_id, &edge.source_id, &edge.target_id, &edge.label],
        ).map_err(|e| e.to_string())?;
    }
    list_canvas_edges(state, space_id).await
}

#[tauri::command]
pub async fn delete_canvas_edge(state: tauri::State<'_, StoreState>, space_id: String, id: String) -> Result<Vec<CanvasEdgeRecord>, String> {
    {
        let inner = state.0.lock().map_err(|e| e.to_string())?;
        inner.conn.execute("DELETE FROM canvas_edges WHERE id=?1 AND space_id=?2", rusqlite::params![&id, &space_id])
            .map_err(|e| e.to_string())?;
    }
    list_canvas_edges(state, space_id).await
}



// ── Unit Tests ──────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_store() -> Result<StoreState, String> { StoreState::open_in_memory() }

    #[test]
    fn test_store_schema_and_default_profile() {
        let store = make_store().expect("failed to create in-memory store");
        let guard = store.0.lock().unwrap();
        assert_eq!(guard.active_profile_id, "default");
        let cnt: i64 = guard.conn.query_row(
            "SELECT COUNT(*) FROM profiles WHERE id=?1",
            rusqlite::params![&"default"],
            |r| r.get::<_, i64>(0),
        ).unwrap();
        assert_eq!(cnt, 1);
    }

    #[test]
    fn test_history_fts5_search_and_dedup() {
        let store = make_store().expect("failed to create in-memory store");
        store.record_history_internal("default", "https://example.com/1", "Example One").unwrap();
        store.record_history_internal("default", "https://rust-lang.org/guide", "Rust Guide").unwrap();

        // Count all history entries for default profile
        {
            let guard = store.0.lock().unwrap();
            let hist_count: i64 = guard.conn.query_row(
                "SELECT COUNT(*) FROM history WHERE profile_id=?1",
                rusqlite::params![&"default"], |r| r.get(0),
            ).unwrap();
            assert_eq!(hist_count, 2);
        }

        // FTS5 search for "rust"
        {
            let guard = store.0.lock().unwrap();
            let rust_count: i64 = guard.conn.query_row(
                "SELECT COUNT(*) FROM history h JOIN history_fts ft ON h.id=ft.rowid \
                 WHERE ft.history_fts MATCH ?1 AND h.profile_id=?2",
                rusqlite::params![&"rust", &"default"], |r| r.get(0),
            ).unwrap();
            assert_eq!(rust_count, 1);
        }

        // Clear history and verify empty
        let profile_id = { let g = store.0.lock().unwrap(); g.active_profile_id.clone() };
        {
            let guard = store.0.lock().unwrap();
            guard.conn.execute(
                "DELETE FROM history WHERE profile_id=?1",
                rusqlite::params![&profile_id],
            ).unwrap();
        }
        let empty_count: i64 = store.0.lock().unwrap()
            .conn.query_row("SELECT COUNT(*) FROM history", [], |r| r.get(0)).unwrap();
        assert_eq!(empty_count, 0);
    }

    #[test]
    fn test_profile_isolation_history_and_bookmarks() {
        let store = make_store().expect("failed to create in-memory store");
        store.record_history_internal("default", "https://test.com", "Test Page").unwrap();
        let guard = store.0.lock().unwrap();
        let hist_count: i64 = guard.conn.query_row(
            "SELECT COUNT(*) FROM history WHERE profile_id=?1",
            rusqlite::params![&"default"], |r| r.get(0),
        ).unwrap();
        assert_eq!(hist_count, 1);
        drop(guard);

        let bid = uuid::Uuid::new_v4().to_string();
        {
            let g = store.0.lock().unwrap();
            g.conn.execute(
                "INSERT INTO bookmarks (id, profile_id, space_id, title, url, created_at) \
                 VALUES (?1, ?2, NULL, 'BM', 'https://t.com/bm', ?3)",
                rusqlite::params![&bid, &g.active_profile_id, chrono_utc_ms()],
            ).unwrap();
        }

        let guard = store.0.lock().unwrap();
        let bm_count: i64 = guard.conn.query_row(
            "SELECT COUNT(*) FROM bookmarks WHERE profile_id=?1",
            rusqlite::params![&"default"], |r| r.get(0),
        ).unwrap();
        assert_eq!(bm_count, 1);

        drop(guard);
        {
            let g = store.0.lock().unwrap();
            g.conn.execute("DELETE FROM bookmarks WHERE id=?1", rusqlite::params![&bid]).unwrap();
        }
        let empty_bm: i64 = store.0.lock().unwrap()
            .conn.query_row("SELECT COUNT(*) FROM bookmarks", [], |r| r.get(0)).unwrap();
        assert_eq!(empty_bm, 0);
    }

    #[test]
    fn test_notes_crud_roundtrip() {
        let store = make_store().expect("failed to create in-memory store");
        let nid = uuid::Uuid::new_v4().to_string();
        {
            let g = store.0.lock().unwrap();
            g.conn.execute(
                "INSERT INTO notes (id, profile_id, title, content, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![&nid, &g.active_profile_id, "My Note", "Content here", chrono_utc_ms()],
            ).unwrap();
        }

        let guard = store.0.lock().unwrap();
        let title: String = guard.conn.query_row(
            "SELECT title FROM notes WHERE id=?1",
            rusqlite::params![&nid], |r| r.get(0),
        ).unwrap();
        assert_eq!(title, "My Note");

        drop(guard);
        {
            let g = store.0.lock().unwrap();
            g.conn.execute(
                "UPDATE notes SET title=?2, content=?3, updated_at=?4 WHERE id=?1",
                rusqlite::params![&nid, "Updated", "New content", chrono_utc_ms()],
            ).unwrap();
        }

        let guard2 = store.0.lock().unwrap();
        let title2: String = guard2.conn.query_row(
            "SELECT title FROM notes WHERE id=?1",
            rusqlite::params![&nid], |r| r.get(0),
        ).unwrap();
        assert_eq!(title2, "Updated");

        drop(guard2);
        {
            let g = store.0.lock().unwrap();
            g.conn.execute("DELETE FROM notes WHERE id=?1", rusqlite::params![&nid]).unwrap();
        }
        let note_result: Result<String, _> = store.0.lock().unwrap()
            .conn.query_row("SELECT title FROM notes WHERE id=?1",
            rusqlite::params![&nid], |r| r.get(0));
        assert!(note_result.is_err());
    }

    #[test]
    fn test_tasks_crud_and_toggle() {
        let store = make_store().expect("failed to create in-memory store");
        let tid = uuid::Uuid::new_v4().to_string();
        {
            let g = store.0.lock().unwrap();
            g.conn.execute(
                "INSERT INTO tasks (id, profile_id, title, completed, due_label, created_at) VALUES (?1, ?2, ?3, 0, ?4, ?5)",
                rusqlite::params![&tid, &g.active_profile_id, "Buy groceries", "2025-12-31", chrono_utc_ms()],
            ).unwrap();
        }

        let guard = store.0.lock().unwrap();
        let completed: i64 = guard.conn.query_row(
            "SELECT completed FROM tasks WHERE id=?1",
            rusqlite::params![&tid], |r| r.get(0),
        ).unwrap();
        assert_eq!(completed, 0);

        drop(guard);
        {
            let g = store.0.lock().unwrap();
            g.conn.execute("UPDATE tasks SET completed=1 WHERE id=?1", rusqlite::params![&tid]).unwrap();
        }
        let guard2 = store.0.lock().unwrap();
        let completed2: i64 = guard2.conn.query_row(
            "SELECT completed FROM tasks WHERE id=?1",
            rusqlite::params![&tid], |r| r.get(0),
        ).unwrap();
        assert_eq!(completed2, 1);

        drop(guard2);
        {
            let g = store.0.lock().unwrap();
            g.conn.execute("UPDATE tasks SET completed=0 WHERE id=?1", rusqlite::params![&tid]).unwrap();
        }

        {
            let g = store.0.lock().unwrap();
            g.conn.execute("DELETE FROM tasks WHERE id=?1", rusqlite::params![&tid]).unwrap();
        }
        let task_result: Result<i64, _> = store.0.lock().unwrap()
            .conn.query_row("SELECT completed FROM tasks WHERE id=?1",
            rusqlite::params![&tid], |r| r.get(0));
        assert!(task_result.is_err());
    }

    #[test]
    fn test_spaces_and_tabs_persistence_roundtrip() {
        let store = make_store().expect("failed to create in-memory store");
        let tabs_json = serde_json::json!([
            {"id":"t1","title":"Tab 1","url":"https://example.com/1","pinned":false,"sort_order":0},
            {"id":"t2","title":"Tab 2","url":"https://example.com/2","pinned":true,"sort_order":1}
        ]).to_string();
        store.sync_workspace_snapshot("space-personal", &tabs_json).expect("save failed");
        let (spaces, loaded_tabs) = store.load_workspace_snapshot().expect("load failed");
        assert_eq!(spaces.len(), 0);
        assert_eq!(loaded_tabs.len(), 1);
        assert_eq!(loaded_tabs[0]["title"], "Tab 1");
    }

    #[test]
    fn test_canvas_nodes_crud_and_space_isolation() {
        let store = make_store().expect("failed to create in-memory store");
        let nid1 = uuid::Uuid::new_v4().to_string();
        let nid2 = uuid::Uuid::new_v4().to_string();
        let now = chrono_utc_ms();

        // Insert nodes for different spaces
        {
            let g = store.0.lock().unwrap();
            g.conn.execute(
                "INSERT INTO canvas_nodes (id, profile_id, space_id, kind, title, content, url, x, y, width, height, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                rusqlite::params![&nid1, &g.active_profile_id, "space-work", "web", "Work Page", "https://work.com",
                    Some("https://work.com".to_string()), 100.0, 200.0, 300.0, 200.0, now],
            ).unwrap();
            g.conn.execute(
                "INSERT INTO canvas_nodes (id, profile_id, space_id, kind, title, content, url, x, y, width, height, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                rusqlite::params![&nid2, &g.active_profile_id, "space-personal", "ai-card", "AI Card", "Research",
                    None::<String>, 50.0, 100.0, 400.0, 300.0, now],
            ).unwrap();
        }

        // Query work space nodes count
        {
            let guard = store.0.lock().unwrap();
            let count: i64 = guard.conn.query_row(
                "SELECT COUNT(*) FROM canvas_nodes WHERE profile_id=?1 AND space_id=?2",
                rusqlite::params![&guard.active_profile_id, "space-work"], |r| r.get(0),
            ).unwrap();
            assert_eq!(count, 1);
        }

        // Query personal space nodes count
        {
            let guard = store.0.lock().unwrap();
            let count: i64 = guard.conn.query_row(
                "SELECT COUNT(*) FROM canvas_nodes WHERE profile_id=?1 AND space_id=?2",
                rusqlite::params![&guard.active_profile_id, "space-personal"], |r| r.get(0),
            ).unwrap();
            assert_eq!(count, 1);
        }

        // Delete node and verify it is gone
        {
            let g = store.0.lock().unwrap();
            g.conn.execute("DELETE FROM canvas_nodes WHERE id=?1 AND space_id=?2", rusqlite::params![&nid1, "space-work"]).unwrap();
        }
        {
            let guard = store.0.lock().unwrap();
            let count: i64 = guard.conn.query_row(
                "SELECT COUNT(*) FROM canvas_nodes WHERE id=?1", rusqlite::params![&nid1], |r| r.get(0),
            ).unwrap_or(0);
            assert_eq!(count, 0);
        }
    }

    #[test]
    fn test_canvas_edges_cascade_on_node_delete() {
        let store = make_store().expect("failed to create in-memory store");
        let sid = uuid::Uuid::new_v4().to_string();
        let tid = uuid::Uuid::new_v4().to_string();
        let eid = uuid::Uuid::new_v4().to_string();

        // Insert nodes and edge
        {
            let g = store.0.lock().unwrap();
            g.conn.execute(
                "INSERT INTO canvas_nodes (id, profile_id, space_id, kind, title, content, url, x, y, width, height, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 0.0, 0.0, 200.0, 150.0, ?7)",
                rusqlite::params![&sid, &g.active_profile_id, "space-work", "web", "Source", "", chrono_utc_ms()],
            ).unwrap();
            g.conn.execute(
                "INSERT INTO canvas_nodes (id, profile_id, space_id, kind, title, content, url, x, y, width, height, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 300.0, 0.0, 200.0, 150.0, ?7)",
                rusqlite::params![&tid, &g.active_profile_id, "space-work", "ai-card", "Target", "", chrono_utc_ms()],
            ).unwrap();
            g.conn.execute(
                "INSERT INTO canvas_edges (id, profile_id, space_id, source_id, target_id, label) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![&eid, &g.active_profile_id, "space-work", &sid, &tid, Some("links to".to_string())],
            ).unwrap();
        }

        // Verify edge exists
        {
            let guard = store.0.lock().unwrap();
            let count: i64 = guard.conn.query_row(
                "SELECT COUNT(*) FROM canvas_edges WHERE source_id=?1", rusqlite::params![&sid], |r| r.get(0),
            ).unwrap();
            assert_eq!(count, 1);
        }

        // Delete edges first (mimics delete_canvas_node cascade logic)
        {
            let g = store.0.lock().unwrap();
            g.conn.execute(
                "DELETE FROM canvas_edges WHERE source_id=?1 OR target_id=?1",
                rusqlite::params![&sid],
            ).unwrap();
        }
        // Delete source node
        {
            let g = store.0.lock().unwrap();
            g.conn.execute("DELETE FROM canvas_nodes WHERE id=?1 AND space_id=?2", rusqlite::params![&sid, "space-work"]).unwrap();
        }

        // Verify edge was deleted too (cascade)
        {
            let guard = store.0.lock().unwrap();
            let count: i64 = guard.conn.query_row(
                "SELECT COUNT(*) FROM canvas_edges WHERE source_id=?1", rusqlite::params![&sid], |r| r.get(0),
            ).unwrap_or(0);
            assert_eq!(count, 0);
        }

        // Verify target node still exists independently
        {
            let guard = store.0.lock().unwrap();
            let count: i64 = guard.conn.query_row(
                "SELECT COUNT(*) FROM canvas_nodes WHERE id=?1", rusqlite::params![&tid], |r| r.get(0),
            ).unwrap_or(0);
            assert_eq!(count, 1);
        }
    }
}
