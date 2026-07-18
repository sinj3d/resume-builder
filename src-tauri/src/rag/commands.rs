use serde::Serialize;
use tauri::State;

use crate::db::DbState;
use crate::rag::EmbeddingState;

/// A bullet point with its similarity score, returned by `search_similar`.
#[derive(Debug, Serialize)]
pub struct ScoredBullet {
    pub id: i64,
    pub experience_id: i64,
    pub content: String,
    pub sort_order: i32,
    pub distance: f32,
}

/// Convert a `Vec<f32>` to its raw byte representation for sqlite-vec.
fn vec_to_bytes(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Embed a single bullet point and store its vector in the `bullet_embeddings` table.
/// Called automatically when a bullet is created or updated.
#[tauri::command]
pub fn embed_bullet(
    db_state: State<'_, DbState>,
    emb_state: State<'_, EmbeddingState>,
    bullet_id: i64,
) -> Result<(), String> {
    let conn = db_state.0.lock().map_err(|e| e.to_string())?;
    let mut model = emb_state.0.lock().map_err(|e| e.to_string())?;

    // Fetch the bullet content
    let content: String = conn
        .query_row(
            "SELECT content FROM bullet_points WHERE id = ?1",
            [bullet_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Bullet {} not found: {}", bullet_id, e))?;

    // Generate embedding
    let embedding = model
        .embed(&content)
        .map_err(|e| format!("Embedding failed: {}", e))?;

    let bytes = vec_to_bytes(&embedding);

    // Store in vec0 table
    conn.execute(
        "INSERT OR REPLACE INTO bullet_embeddings (bullet_id, embedding) VALUES (?1, ?2)",
        rusqlite::params![bullet_id, bytes],
    )
    .map_err(|e| format!("Failed to store embedding: {}", e))?;

    Ok(())
}

/// Embed every bullet point that doesn't have an embedding yet. Returns how
/// many were embedded. Called lazily before any retrieval so search keeps
/// working even when bullets were created without an explicit embed step
/// (manual entry, resume import, etc.).
pub fn embed_missing(
    conn: &rusqlite::Connection,
    model: &mut crate::rag::EmbeddingModel,
) -> Result<u32, String> {
    let mut stmt = conn
        .prepare(
            "SELECT bp.id, bp.content FROM bullet_points bp
             WHERE bp.id NOT IN (SELECT bullet_id FROM bullet_embeddings)",
        )
        .map_err(|e| e.to_string())?;

    let bullets: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut count: u32 = 0;
    for (id, content) in &bullets {
        let embedding = model
            .embed(content)
            .map_err(|e| format!("Embedding failed for bullet {}: {}", id, e))?;

        let bytes = vec_to_bytes(&embedding);

        conn.execute(
            "INSERT OR REPLACE INTO bullet_embeddings (bullet_id, embedding) VALUES (?1, ?2)",
            rusqlite::params![id, bytes],
        )
        .map_err(|e| format!("Failed to store embedding for bullet {}: {}", id, e))?;

        count += 1;
    }

    Ok(count)
}

/// Embed ALL bullet points that don't yet have embeddings.
/// Useful for initial setup or after bulk import.
#[tauri::command]
pub fn embed_all_bullets(
    db_state: State<'_, DbState>,
    emb_state: State<'_, EmbeddingState>,
) -> Result<u32, String> {
    let conn = db_state.0.lock().map_err(|e| e.to_string())?;
    let mut model = emb_state.0.lock().map_err(|e| e.to_string())?;
    embed_missing(&conn, &mut model)
}

/// Semantic search: embed the query text and find the most similar bullet points.
/// Optionally filter by archetype.
#[tauri::command]
pub fn search_similar(
    db_state: State<'_, DbState>,
    emb_state: State<'_, EmbeddingState>,
    query: String,
    archetype_id: Option<i64>,
    top_k: Option<i32>,
) -> Result<Vec<ScoredBullet>, String> {
    let conn = db_state.0.lock().map_err(|e| e.to_string())?;
    let mut model = emb_state.0.lock().map_err(|e| e.to_string())?;

    let k = top_k.unwrap_or(10);

    // Self-heal: bullets created without an explicit embed step still search.
    embed_missing(&conn, &mut model)?;

    // Embed the query
    let query_embedding = model
        .embed(&query)
        .map_err(|e| format!("Query embedding failed: {}", e))?;

    let query_bytes = vec_to_bytes(&query_embedding);

    // KNN query against vec0 table. The neighbor pool is fetched wide and
    // filtered afterwards so an archetype filter can't starve the results;
    // the filter accepts bullets tagged directly OR belonging to a tagged
    // experience (the UI mostly tags whole experiences).
    const KNN_POOL: i64 = 256;
    let results = if let Some(arch_id) = archetype_id.filter(|id| *id > 0) {
        let mut stmt = conn
            .prepare(
                "SELECT be.bullet_id, be.distance, bp.experience_id, bp.content, bp.sort_order
                 FROM bullet_embeddings be
                 INNER JOIN bullet_points bp ON bp.id = be.bullet_id
                 WHERE be.embedding MATCH ?1
                   AND k = ?2
                   AND (
                        bp.experience_id IN
                            (SELECT experience_id FROM archetype_experiences WHERE archetype_id = ?3)
                     OR bp.id IN
                            (SELECT bullet_point_id FROM archetype_bullets WHERE archetype_id = ?3)
                   )
                 ORDER BY be.distance
                 LIMIT ?4",
            )
            .map_err(|e| e.to_string())?;

        let rows: Vec<ScoredBullet> = stmt
            .query_map(rusqlite::params![query_bytes, KNN_POOL, arch_id, k], |row| {
                Ok(ScoredBullet {
                    id: row.get(0)?,
                    distance: row.get(1)?,
                    experience_id: row.get(2)?,
                    content: row.get(3)?,
                    sort_order: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT be.bullet_id, be.distance, bp.experience_id, bp.content, bp.sort_order
                 FROM bullet_embeddings be
                 INNER JOIN bullet_points bp ON bp.id = be.bullet_id
                 WHERE be.embedding MATCH ?1
                   AND k = ?2
                 ORDER BY be.distance
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;

        let rows: Vec<ScoredBullet> = stmt
            .query_map(rusqlite::params![query_bytes, KNN_POOL, k], |row| {
                Ok(ScoredBullet {
                    id: row.get(0)?,
                    distance: row.get(1)?,
                    experience_id: row.get(2)?,
                    content: row.get(3)?,
                    sort_order: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    Ok(results)
}
