use tauri::State;

use crate::db::DbState;
use crate::rag::retrieval::RetrievedBullet;
use crate::rag::EmbeddingState;

/// Convert a `Vec<f32>` to its raw byte representation for sqlite-vec.
pub(crate) fn vec_to_bytes(v: &[f32]) -> Vec<u8> {
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

/// Hybrid search: semantic KNN + FTS5 keyword search fused with RRF.
/// Optionally filter by archetype.
#[tauri::command]
pub fn search_similar(
    db_state: State<'_, DbState>,
    emb_state: State<'_, EmbeddingState>,
    query: String,
    archetype_id: Option<i64>,
    top_k: Option<i32>,
) -> Result<Vec<RetrievedBullet>, String> {
    let conn = db_state.0.lock().map_err(|e| e.to_string())?;
    let mut model = emb_state.0.lock().map_err(|e| e.to_string())?;

    // Archetype 0 is the frontend's "Any / General" choice — no filter.
    crate::rag::retrieval::retrieve_hybrid(
        &conn,
        &mut model,
        &query,
        archetype_id.filter(|id| *id > 0),
        top_k.unwrap_or(10) as i64,
    )
}
