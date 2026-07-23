pub mod commands;
pub mod models;
pub mod seed_templates;

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
pub(crate) fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS experiences (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            org         TEXT,
            start_date  TEXT,
            end_date    TEXT,
            category    TEXT NOT NULL,
            link        TEXT,
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

        CREATE TABLE IF NOT EXISTS education_details (
            experience_id INTEGER PRIMARY KEY REFERENCES experiences(id) ON DELETE CASCADE,
            degree     TEXT,
            gpa        TEXT,
            coursework TEXT,
            honors     TEXT
        );

        CREATE TABLE IF NOT EXISTS resume_configs (
            archetype_id  INTEGER PRIMARY KEY REFERENCES archetypes(id) ON DELETE CASCADE,
            layout_json   TEXT,
            sections_json TEXT,
            updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cover_letters (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            archetype_id    INTEGER REFERENCES archetypes(id) ON DELETE SET NULL,
            job_description TEXT NOT NULL,
            content         TEXT NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cover_letter_templates (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL UNIQUE,
            content    TEXT NOT NULL,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS bullet_fts USING fts5(
            content, content='bullet_points', content_rowid='id', tokenize='porter unicode61');

        CREATE TRIGGER IF NOT EXISTS bullet_fts_ai AFTER INSERT ON bullet_points BEGIN
            INSERT INTO bullet_fts(rowid, content) VALUES (new.id, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS bullet_fts_ad AFTER DELETE ON bullet_points BEGIN
            INSERT INTO bullet_fts(bullet_fts, rowid, content) VALUES ('delete', old.id, old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS bullet_fts_au AFTER UPDATE OF content ON bullet_points BEGIN
            INSERT INTO bullet_fts(bullet_fts, rowid, content) VALUES ('delete', old.id, old.content);
            INSERT INTO bullet_fts(rowid, content) VALUES (new.id, new.content);
        END;

        -- Embedding hygiene: without these, editing a bullet leaves a stale
        -- vector and deleting one (directly or via experience cascade) leaves
        -- an orphan — embed_missing only fills rows that are absent.
        CREATE TRIGGER IF NOT EXISTS bullet_emb_ad AFTER DELETE ON bullet_points BEGIN
            DELETE FROM bullet_embeddings WHERE bullet_id = old.id;
        END;
        CREATE TRIGGER IF NOT EXISTS bullet_emb_au AFTER UPDATE OF content ON bullet_points BEGIN
            DELETE FROM bullet_embeddings WHERE bullet_id = old.id;
        END;

        -- Job application tracker. Status values are validated in Rust
        -- (db::models::APPLICATION_STATUSES), not with a CHECK — this schema
        -- already needed a table swap once to remove a CHECK constraint.
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company TEXT NOT NULL, role_title TEXT NOT NULL, url TEXT,
            status TEXT NOT NULL DEFAULT 'applied', applied_at TEXT, notes TEXT,
            cover_letter_id INTEGER REFERENCES cover_letters(id) ON DELETE SET NULL,
            archetype_id INTEGER REFERENCES archetypes(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')));
        "
    )?;

    // Seed the builtin cover letter templates exactly once, guarded by a marker
    // in app_settings. A blind INSERT OR IGNORE on every launch (or "seed when
    // empty") would resurrect builtins the user deliberately deleted.
    let seeded: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_settings WHERE key = 'builtin_templates_seeded'",
        [],
        |row| row.get(0),
    )?;
    if seeded == 0 {
        for (name, content) in seed_templates::BUILTIN_TEMPLATES {
            conn.execute(
                "INSERT OR IGNORE INTO cover_letter_templates (name, content, is_builtin) VALUES (?1, ?2, 1)",
                rusqlite::params![name, content],
            )?;
        }
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('builtin_templates_seeded', '1')",
            [],
        )?;
    }

    // One-time FTS backfill: the triggers only cover writes made after they
    // exist, so databases upgraded from older versions need a full rebuild.
    let fts_backfilled: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_settings WHERE key = 'bullet_fts_backfilled_v1'",
        [],
        |row| row.get(0),
    )?;
    if fts_backfilled == 0 {
        conn.execute("INSERT INTO bullet_fts(bullet_fts) VALUES ('rebuild')", [])?;
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('bullet_fts_backfilled_v1', '1')",
            [],
        )?;
    }

    // One-time embedding wipe: bullets edited before the hygiene triggers
    // existed may have stale vectors, and there is no content hash to tell
    // which. embed_missing re-embeds everything lazily on the next retrieval.
    let embeddings_reset: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_settings WHERE key = 'embeddings_reset_v1'",
        [],
        |row| row.get(0),
    )?;
    if embeddings_reset == 0 {
        conn.execute("DELETE FROM bullet_embeddings", [])?;
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('embeddings_reset_v1', '1')",
            [],
        )?;
    }

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

    // Add the optional per-experience `link` column to databases created before
    // it existed. ALTER TABLE ADD COLUMN is not idempotent, so guard on
    // pragma_table_info. Covers both freshly-swapped and untouched tables.
    let has_link: bool = conn
        .prepare("SELECT 1 FROM pragma_table_info('experiences') WHERE name = 'link'")?
        .exists([])?;
    if !has_link {
        conn.execute("ALTER TABLE experiences ADD COLUMN link TEXT", [])?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::OptionalExtension;

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

    #[test]
    fn test_builtin_templates_seeded_once() {
        let conn = test_conn();
        run_migrations(&conn).unwrap();

        let builtin_count = || -> i64 {
            conn.query_row(
                "SELECT COUNT(*) FROM cover_letter_templates WHERE is_builtin = 1",
                [],
                |row| row.get(0),
            )
            .unwrap()
        };

        let expected = seed_templates::BUILTIN_TEMPLATES.len() as i64;
        assert_eq!(builtin_count(), expected);

        // Rerunning migrations must not duplicate the builtins.
        run_migrations(&conn).unwrap();
        assert_eq!(builtin_count(), expected);

        // A builtin deleted by the user must NOT be resurrected on relaunch.
        let first_name = seed_templates::BUILTIN_TEMPLATES[0].0;
        conn.execute(
            "DELETE FROM cover_letter_templates WHERE name = ?1",
            [first_name],
        )
        .unwrap();
        run_migrations(&conn).unwrap();
        assert_eq!(builtin_count(), expected - 1);
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
    fn test_fts_sync_insert_update_delete_cascade() {
        let conn = test_conn();
        run_migrations(&conn).unwrap();

        let fts_hits = |q: &str| -> i64 {
            conn.query_row(
                "SELECT COUNT(*) FROM bullet_fts WHERE bullet_fts MATCH ?1",
                [q],
                |row| row.get(0),
            )
            .unwrap()
        };

        conn.execute(
            "INSERT INTO experiences (title, category) VALUES ('Job', 'job')",
            [],
        )
        .unwrap();
        let exp_id = conn.last_insert_rowid();

        // INSERT is indexed.
        conn.execute(
            "INSERT INTO bullet_points (experience_id, content, sort_order) VALUES (?1, 'Deployed kubernetes clusters', 0)",
            [exp_id],
        )
        .unwrap();
        let bullet_id = conn.last_insert_rowid();
        assert_eq!(fts_hits("kubernetes"), 1);

        // UPDATE re-indexes: old term gone, new term found.
        conn.execute(
            "UPDATE bullet_points SET content = 'Wrote terraform modules' WHERE id = ?1",
            [bullet_id],
        )
        .unwrap();
        assert_eq!(fts_hits("kubernetes"), 0);
        assert_eq!(fts_hits("terraform"), 1);

        // Direct DELETE de-indexes.
        conn.execute("DELETE FROM bullet_points WHERE id = ?1", [bullet_id]).unwrap();
        assert_eq!(fts_hits("terraform"), 0);

        // Experience cascade-delete also de-indexes (FK cascade fires the
        // AFTER DELETE trigger on bullet_points).
        conn.execute(
            "INSERT INTO bullet_points (experience_id, content, sort_order) VALUES (?1, 'Optimized postgres queries', 0)",
            [exp_id],
        )
        .unwrap();
        assert_eq!(fts_hits("postgres"), 1);
        conn.execute("DELETE FROM experiences WHERE id = ?1", [exp_id]).unwrap();
        assert_eq!(fts_hits("postgres"), 0);

        // The external-content index must be internally consistent.
        conn.execute(
            "INSERT INTO bullet_fts(bullet_fts, rank) VALUES('integrity-check', 1)",
            [],
        )
        .unwrap();
    }

    /// Go/no-go for the embedding-hygiene triggers: DELETEs against a vec0
    /// virtual table must work from inside bullet_points triggers, including
    /// when the trigger itself fires via FK cascade. If this ever breaks,
    /// fall back to explicit DELETEs in db::commands (update_bullet,
    /// delete_bullet, delete_experience).
    #[test]
    fn test_embedding_triggers_on_vec0() {
        let conn = test_conn();
        run_migrations(&conn).unwrap();

        let emb_count = || -> i64 {
            conn.query_row("SELECT COUNT(*) FROM bullet_embeddings", [], |row| row.get(0))
                .unwrap()
        };
        let fake_embedding: Vec<f32> = (0..384).map(|i| (i as f32) / 384.0).collect();
        let bytes: Vec<u8> = fake_embedding.iter().flat_map(|f| f.to_le_bytes()).collect();

        conn.execute(
            "INSERT INTO experiences (title, category) VALUES ('Job', 'job')",
            [],
        )
        .unwrap();
        let exp_id = conn.last_insert_rowid();

        let insert_bullet_with_embedding = |content: &str| -> i64 {
            conn.execute(
                "INSERT INTO bullet_points (experience_id, content, sort_order) VALUES (?1, ?2, 0)",
                rusqlite::params![exp_id, content],
            )
            .unwrap();
            let id = conn.last_insert_rowid();
            conn.execute(
                "INSERT INTO bullet_embeddings (bullet_id, embedding) VALUES (?1, ?2)",
                rusqlite::params![id, bytes.clone()],
            )
            .unwrap();
            id
        };

        // Content UPDATE drops the now-stale vector.
        let b1 = insert_bullet_with_embedding("original text");
        assert_eq!(emb_count(), 1);
        conn.execute(
            "UPDATE bullet_points SET content = 'edited text' WHERE id = ?1",
            [b1],
        )
        .unwrap();
        assert_eq!(emb_count(), 0, "stale vector must be dropped on content edit");

        // Direct DELETE drops the vector.
        let b2 = insert_bullet_with_embedding("to be deleted");
        assert_eq!(emb_count(), 1);
        conn.execute("DELETE FROM bullet_points WHERE id = ?1", [b2]).unwrap();
        assert_eq!(emb_count(), 0, "orphan vector must be dropped on bullet delete");

        // Experience cascade-delete drops the vector too.
        insert_bullet_with_embedding("cascade victim");
        assert_eq!(emb_count(), 1);
        conn.execute("DELETE FROM experiences WHERE id = ?1", [exp_id]).unwrap();
        assert_eq!(emb_count(), 0, "orphan vector must be dropped on experience cascade");
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

    // ─── Application Tracker ───

    #[test]
    fn test_applications_crud_and_set_null() {
        let conn = test_conn();
        run_migrations(&conn).unwrap();

        conn.execute("INSERT INTO archetypes (name) VALUES ('SWE')", []).unwrap();
        let arch_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO cover_letters (archetype_id, job_description, content) VALUES (?1, 'JD text', 'Letter body')",
            [arch_id],
        )
        .unwrap();
        let letter_id = conn.last_insert_rowid();

        // CREATE
        conn.execute(
            "INSERT INTO applications (company, role_title, url, status, cover_letter_id, archetype_id)
             VALUES ('Acme', 'SWE II', 'https://acme.example/job', 'applied', ?1, ?2)",
            rusqlite::params![letter_id, arch_id],
        )
        .unwrap();
        let app_id = conn.last_insert_rowid();

        // READ
        let (company, status, cl, arch): (String, String, Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT company, status, cover_letter_id, archetype_id FROM applications WHERE id = ?1",
                [app_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(company, "Acme");
        assert_eq!(status, "applied");
        assert_eq!(cl, Some(letter_id));
        assert_eq!(arch, Some(arch_id));

        // UPDATE
        conn.execute(
            "UPDATE applications SET status = 'interviewing', updated_at = datetime('now') WHERE id = ?1",
            [app_id],
        )
        .unwrap();
        let new_status: String = conn
            .query_row("SELECT status FROM applications WHERE id = ?1", [app_id], |row| row.get(0))
            .unwrap();
        assert_eq!(new_status, "interviewing");

        // Deleting the cover letter must SET NULL, not cascade-delete the application.
        conn.execute("DELETE FROM cover_letters WHERE id = ?1", [letter_id]).unwrap();
        let (still_exists, cl_after): (i64, Option<i64>) = conn
            .query_row(
                "SELECT COUNT(*), (SELECT cover_letter_id FROM applications WHERE id = ?1) FROM applications WHERE id = ?1",
                [app_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(still_exists, 1, "application row must survive letter deletion");
        assert_eq!(cl_after, None, "cover_letter_id must be SET NULL");

        // Deleting the archetype must also SET NULL, not cascade-delete.
        conn.execute("DELETE FROM archetypes WHERE id = ?1", [arch_id]).unwrap();
        let (still_exists, arch_after): (i64, Option<i64>) = conn
            .query_row(
                "SELECT COUNT(*), (SELECT archetype_id FROM applications WHERE id = ?1) FROM applications WHERE id = ?1",
                [app_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(still_exists, 1, "application row must survive archetype deletion");
        assert_eq!(arch_after, None, "archetype_id must be SET NULL");

        // DELETE
        let affected = conn.execute("DELETE FROM applications WHERE id = ?1", [app_id]).unwrap();
        assert_eq!(affected, 1);
    }

    #[test]
    fn test_application_status_validation() {
        for status in models::APPLICATION_STATUSES {
            assert!(models::validate_status(status).is_ok(), "'{}' should be valid", status);
        }
        for bad in ["Applied", "pending", "", "withdrawn"] {
            assert!(models::validate_status(bad).is_err(), "'{}' should be invalid", bad);
        }
    }

    // ─── App settings (generic key/value) ───

    #[test]
    fn test_app_setting_get_absent_and_round_trip() {
        let conn = test_conn();
        run_migrations(&conn).unwrap();

        // Absent key -> None (mirrors get_app_setting's use of .optional()).
        let missing: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                ["onboarding_complete"],
                |row| row.get(0),
            )
            .optional()
            .unwrap();
        assert_eq!(missing, None);

        // Set then get -> round-trips.
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
            rusqlite::params!["onboarding_complete", "1"],
        )
        .unwrap();
        let value: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                ["onboarding_complete"],
                |row| row.get(0),
            )
            .optional()
            .unwrap();
        assert_eq!(value, Some("1".to_string()));

        // Re-set (INSERT OR REPLACE) overwrites rather than erroring.
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
            rusqlite::params!["onboarding_complete", "0"],
        )
        .unwrap();
        let updated: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                ["onboarding_complete"],
                |row| row.get(0),
            )
            .optional()
            .unwrap();
        assert_eq!(updated, Some("0".to_string()));
    }
}
