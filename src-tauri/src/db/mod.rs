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
            category    TEXT NOT NULL,
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

        CREATE TABLE IF NOT EXISTS archetype_experiences (
            archetype_id    INTEGER NOT NULL REFERENCES archetypes(id) ON DELETE CASCADE,
            experience_id   INTEGER NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
            PRIMARY KEY (archetype_id, experience_id)
        );

        CREATE TABLE IF NOT EXISTS skills (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            name     TEXT NOT NULL,
            UNIQUE(category, name)
        );

        CREATE TABLE IF NOT EXISTS archetype_skills (
            archetype_id INTEGER NOT NULL REFERENCES archetypes(id) ON DELETE CASCADE,
            skill_id     INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
            PRIMARY KEY (archetype_id, skill_id)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS bullet_embeddings USING vec0(
            bullet_id INTEGER PRIMARY KEY,
            embedding FLOAT[384]
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS bio (
            id       INTEGER PRIMARY KEY CHECK (id = 1),
            name     TEXT,
            email    TEXT,
            phone    TEXT,
            location TEXT,
            linkedin TEXT,
            github   TEXT,
            website  TEXT
        );
        INSERT OR IGNORE INTO bio (id) VALUES (1);
        "
    )?;

    // Check if the experiences table has the old CHECK constraint
    let create_sql: String = conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='experiences'",
        [],
        |row| row.get(0),
    )?;

    if create_sql.contains("CHECK(category IN") {
        // Perform table swap to remove the constraint
        conn.execute_batch(
            "
            PRAGMA foreign_keys=OFF;
            BEGIN TRANSACTION;
            
            CREATE TABLE experiences_new (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT NOT NULL,
                org         TEXT,
                start_date  TEXT,
                end_date    TEXT,
                category    TEXT NOT NULL,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            INSERT INTO experiences_new (id, title, org, start_date, end_date, category, created_at, updated_at)
            SELECT id, title, org, start_date, end_date, category, created_at, updated_at FROM experiences;
            
            DROP TABLE experiences;
            ALTER TABLE experiences_new RENAME TO experiences;
            
            COMMIT;
            PRAGMA foreign_keys=ON;
            "
        )?;
    }

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

    // ─── CRUD Integration Tests ───

    #[test]
    fn test_experience_crud() {
        let conn = test_conn();
        run_migrations(&conn).unwrap();

        // CREATE
        conn.execute(
            "INSERT INTO experiences (title, org, start_date, end_date, category) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params!["SWE Intern", "Google", "2024-06", "2024-09", "job"],
        ).unwrap();
        let id = conn.last_insert_rowid();
        assert_eq!(id, 1);

        // READ
        let (title, org, category): (String, String, String) = conn
            .query_row(
                "SELECT title, org, category FROM experiences WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(title, "SWE Intern");
        assert_eq!(org, "Google");
        assert_eq!(category, "job");

        // UPDATE
        conn.execute(
            "UPDATE experiences SET title = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params!["Senior SWE Intern", id],
        ).unwrap();
        let new_title: String = conn
            .query_row("SELECT title FROM experiences WHERE id = ?1", [id], |row| row.get(0))
            .unwrap();
        assert_eq!(new_title, "Senior SWE Intern");

        // DELETE
        let affected = conn.execute("DELETE FROM experiences WHERE id = ?1", [id]).unwrap();
        assert_eq!(affected, 1);

        // Verify gone
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM experiences", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_bullet_points_crud_and_cascade() {
        let conn = test_conn();
        run_migrations(&conn).unwrap();

        // Create an experience
        conn.execute(
            "INSERT INTO experiences (title, category) VALUES ('Test Job', 'job')",
            [],
        ).unwrap();
        let exp_id = conn.last_insert_rowid();

        // Create bullet points
        conn.execute(
            "INSERT INTO bullet_points (experience_id, content, sort_order) VALUES (?1, ?2, 0)",
            rusqlite::params![exp_id, "Built a REST API serving 10k req/s"],
        ).unwrap();
        conn.execute(
            "INSERT INTO bullet_points (experience_id, content, sort_order) VALUES (?1, ?2, 1)",
            rusqlite::params![exp_id, "Reduced latency by 40%"],
        ).unwrap();

        // Verify 2 bullets exist
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM bullet_points WHERE experience_id = ?1",
                [exp_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);

        // DELETE experience → should CASCADE delete bullets
        conn.execute("DELETE FROM experiences WHERE id = ?1", [exp_id]).unwrap();

        let bullet_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM bullet_points", [], |row| row.get(0))
            .unwrap();
        assert_eq!(bullet_count, 0, "CASCADE delete should remove bullet_points");
    }

    #[test]
    fn test_archetype_tagging() {
        let conn = test_conn();
        run_migrations(&conn).unwrap();

        // Create experience + bullet
        conn.execute(
            "INSERT INTO experiences (title, category) VALUES ('ML Project', 'project')",
            [],
        ).unwrap();
        let exp_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO bullet_points (experience_id, content, sort_order) VALUES (?1, 'Trained BERT model', 0)",
            [exp_id],
        ).unwrap();
        let bullet_id = conn.last_insert_rowid();

        // Create archetype
        conn.execute("INSERT INTO archetypes (name) VALUES ('ML Engineer')", []).unwrap();
        let arch_id = conn.last_insert_rowid();

        // Tag bullet to archetype
        conn.execute(
            "INSERT INTO archetype_bullets (archetype_id, bullet_point_id) VALUES (?1, ?2)",
            rusqlite::params![arch_id, bullet_id],
        ).unwrap();

        // Query tagged bullets via JOIN
        let tagged_content: String = conn
            .query_row(
                "SELECT bp.content FROM bullet_points bp
                 INNER JOIN archetype_bullets ab ON ab.bullet_point_id = bp.id
                 WHERE ab.archetype_id = ?1",
                [arch_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tagged_content, "Trained BERT model");

        // INSERT OR IGNORE duplicate tag (should not error)
        conn.execute(
            "INSERT OR IGNORE INTO archetype_bullets (archetype_id, bullet_point_id) VALUES (?1, ?2)",
            rusqlite::params![arch_id, bullet_id],
        ).unwrap();
    }


    #[test]
    fn test_vec0_embedding_insert_and_query() {
        let conn = test_conn();
        run_migrations(&conn).unwrap();

        // Insert a fake 384-dimensional embedding
        let fake_embedding: Vec<f32> = (0..384).map(|i| (i as f32) / 384.0).collect();
        let bytes: Vec<u8> = fake_embedding.iter().flat_map(|f| f.to_le_bytes()).collect();

        conn.execute(
            "INSERT INTO bullet_embeddings (bullet_id, embedding) VALUES (?1, ?2)",
            rusqlite::params![42i64, bytes],
        ).unwrap();

        // Verify it was stored
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM bullet_embeddings",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        // KNN query with the same vector should return itself
        let mut stmt = conn
            .prepare(
                "SELECT bullet_id, distance FROM bullet_embeddings
                 WHERE embedding MATCH ?1
                 AND k = 1
                 ORDER BY distance",
            )
            .unwrap();

        let results: Vec<(i64, f32)> = stmt
            .query_map(rusqlite::params![bytes], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, 42, "Should find the same bullet_id");
        assert!(results[0].1 < 0.001, "Distance to itself should be ~0, got {}", results[0].1);
    }

    #[test]
    fn test_vec0_knn_returns_nearest() {
        let conn = test_conn();
        run_migrations(&conn).unwrap();

        // Insert 3 embeddings: one "close" and two "far"
        let close_vec: Vec<f32> = (0..384).map(|i| (i as f32) / 384.0).collect();
        let far_vec1: Vec<f32> = (0..384).map(|i| -((i as f32) / 384.0)).collect();
        let far_vec2: Vec<f32> = (0..384).map(|_| 0.5f32).collect();

        for (id, vec) in [(1i64, &close_vec), (2, &far_vec1), (3, &far_vec2)] {
            let bytes: Vec<u8> = vec.iter().flat_map(|f| f.to_le_bytes()).collect();
            conn.execute(
                "INSERT INTO bullet_embeddings (bullet_id, embedding) VALUES (?1, ?2)",
                rusqlite::params![id, bytes],
            ).unwrap();
        }

        // Query with close_vec → should return bullet_id=1 as nearest
        let query_bytes: Vec<u8> = close_vec.iter().flat_map(|f| f.to_le_bytes()).collect();
        let mut stmt = conn
            .prepare(
                "SELECT bullet_id, distance FROM bullet_embeddings
                 WHERE embedding MATCH ?1 AND k = 3
                 ORDER BY distance",
            )
            .unwrap();

        let results: Vec<(i64, f32)> = stmt
            .query_map(rusqlite::params![query_bytes], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(results.len(), 3, "Should return all 3 results");
        assert_eq!(results[0].0, 1, "Nearest should be bullet_id=1 (itself)");
        assert!(results[0].1 < results[1].1, "Results should be ordered by distance");
    }
}
