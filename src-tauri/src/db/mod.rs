pub mod commands;
pub mod models;

use rusqlite::Connection;
use std::sync::Mutex;

/// Application database state, managed by Tauri.
pub struct DbState(pub Mutex<Connection>);

/// Initialize the SQLite database at the given path, load sqlite-vec, and run migrations.
pub fn init_db(db_path: &str) -> Result<Connection, Box<dyn std::error::Error>> {
    // Register sqlite-vec as an auto-extension before opening any connection
    unsafe {
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    }

    let conn = Connection::open(db_path)?;

    // Enable WAL mode for better concurrent read performance
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    run_migrations(&conn)?;

    Ok(conn)
}

/// Run all schema migrations.
fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS experiences (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            org         TEXT,
            start_date  TEXT,
            end_date    TEXT,
            category    TEXT NOT NULL CHECK(category IN ('job', 'project', 'hackathon', 'education')),
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS bullet_points (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            experience_id   INTEGER NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
            content         TEXT NOT NULL,
            sort_order      INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS archetypes (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS archetype_bullets (
            archetype_id    INTEGER NOT NULL REFERENCES archetypes(id) ON DELETE CASCADE,
            bullet_point_id INTEGER NOT NULL REFERENCES bullet_points(id) ON DELETE CASCADE,
            PRIMARY KEY (archetype_id, bullet_point_id)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS bullet_embeddings USING vec0(
            bullet_id INTEGER PRIMARY KEY,
            embedding FLOAT[384]
        );
        "
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: register sqlite-vec and create an in-memory connection.
    fn test_conn() -> Connection {
        unsafe {
            rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
                sqlite_vec::sqlite3_vec_init as *const (),
            )));
        }
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn
    }

    #[test]
    fn test_init_db_in_memory() {
        let conn = test_conn();
        run_migrations(&conn).unwrap();

        // Verify tables exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(tables.contains(&"experiences".to_string()));
        assert!(tables.contains(&"bullet_points".to_string()));
        assert!(tables.contains(&"archetypes".to_string()));
        assert!(tables.contains(&"archetype_bullets".to_string()));
    }

    #[test]
    fn test_migrations_idempotent() {
        let conn = test_conn();

        // Running migrations twice should not error
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap();
    }
}
