use serde::Serialize;

/// KNN over-fetch size: the nearest neighbors are fetched wide and then
/// filtered by archetype, so a tag filter can never starve the results just
/// because the globally-nearest bullets belong to other archetypes.
const KNN_POOL: i64 = 256;

/// How many candidates each arm (vector, keyword) contributes to fusion.
const ARM_POOL: i64 = 50;

/// Reciprocal Rank Fusion constant. 60 is the standard from the original RRF
/// paper; ranks are used instead of raw scores because cosine distance and
/// bm25 live on incomparable scales.
const RRF_K: f64 = 60.0;

/// A bullet point retrieved by hybrid search, with its fused score and the
/// per-arm evidence (`None` when that arm didn't surface it).
#[derive(Debug, Clone, Serialize)]
pub struct RetrievedBullet {
    pub id: i64,
    pub experience_id: i64,
    pub content: String,
    pub sort_order: i32,
    pub score: f64,
    pub vector_distance: Option<f32>,
    pub keyword_rank: Option<i64>,
}

/// A candidate row from one retrieval arm, before fusion.
#[derive(Debug, Clone)]
struct Candidate {
    id: i64,
    experience_id: i64,
    content: String,
    sort_order: i32,
}

/// Hybrid retrieval: semantic KNN + FTS5 keyword search, fused with
/// Reciprocal Rank Fusion. The single entry point for every retrieval path
/// (search UI, cover-letter generation, and job-description resume tailoring).
///
/// Degrades gracefully: with no embeddings it is pure keyword search, with no
/// FTS matches it is pure vector search, and with neither it returns an empty
/// vec (callers keep their own empty-result handling).
pub fn retrieve_hybrid(
    conn: &rusqlite::Connection,
    model: &mut crate::rag::EmbeddingModel,
    query: &str,
    archetype_id: Option<i64>,
    top_k: i64,
) -> Result<Vec<RetrievedBullet>, String> {
    // Self-heal: bullets created without an explicit embed step still search.
    crate::rag::commands::embed_missing(conn, model)?;

    let query_embedding = model
        .embed(query)
        .map_err(|e| format!("Query embedding failed: {}", e))?;
    let query_bytes = crate::rag::commands::vec_to_bytes(&query_embedding);

    let vector = vector_candidates(conn, &query_bytes, archetype_id, ARM_POOL)?;
    let keyword = match fts_match_query(query) {
        Some(match_query) => keyword_candidates(conn, &match_query, archetype_id, ARM_POOL)?,
        None => Vec::new(),
    };

    Ok(rrf_fuse(vector, keyword, top_k))
}

/// Semantic arm: KNN over the vec0 table, best-first (smallest distance).
fn vector_candidates(
    conn: &rusqlite::Connection,
    query_bytes: &[u8],
    archetype_id: Option<i64>,
    pool: i64,
) -> Result<Vec<(Candidate, f32)>, String> {
    // The archetype filter accepts bullets tagged directly OR belonging to a
    // tagged experience (the UI mostly tags whole experiences).
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<(Candidate, f32)> {
        Ok((
            Candidate {
                id: row.get(0)?,
                experience_id: row.get(1)?,
                content: row.get(2)?,
                sort_order: row.get(3)?,
            },
            row.get(4)?,
        ))
    };

    let rows: Vec<(Candidate, f32)> = if let Some(arch_id) = archetype_id {
        let mut stmt = conn
            .prepare(
                "SELECT be.bullet_id, bp.experience_id, bp.content, bp.sort_order, be.distance
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
        let rows = stmt
            .query_map(
                rusqlite::params![query_bytes, KNN_POOL, arch_id, pool],
                map_row,
            )
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT be.bullet_id, bp.experience_id, bp.content, bp.sort_order, be.distance
                 FROM bullet_embeddings be
                 INNER JOIN bullet_points bp ON bp.id = be.bullet_id
                 WHERE be.embedding MATCH ?1
                   AND k = ?2
                 ORDER BY be.distance
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![query_bytes, KNN_POOL, pool], map_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };

    Ok(rows)
}

/// Keyword arm: FTS5 bm25 ranking, best-first (bm25 is negative; ascending).
fn keyword_candidates(
    conn: &rusqlite::Connection,
    match_query: &str,
    archetype_id: Option<i64>,
    pool: i64,
) -> Result<Vec<Candidate>, String> {
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<Candidate> {
        Ok(Candidate {
            id: row.get(0)?,
            experience_id: row.get(1)?,
            content: row.get(2)?,
            sort_order: row.get(3)?,
        })
    };

    let rows: Vec<Candidate> = if let Some(arch_id) = archetype_id {
        let mut stmt = conn
            .prepare(
                "SELECT bp.id, bp.experience_id, bp.content, bp.sort_order, bm25(bullet_fts) AS s
                 FROM bullet_fts
                 JOIN bullet_points bp ON bp.id = bullet_fts.rowid
                 WHERE bullet_fts MATCH ?1
                   AND (
                        bp.experience_id IN
                            (SELECT experience_id FROM archetype_experiences WHERE archetype_id = ?2)
                     OR bp.id IN
                            (SELECT bullet_point_id FROM archetype_bullets WHERE archetype_id = ?2)
                   )
                 ORDER BY s
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![match_query, arch_id, pool], map_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT bp.id, bp.experience_id, bp.content, bp.sort_order, bm25(bullet_fts) AS s
                 FROM bullet_fts
                 JOIN bullet_points bp ON bp.id = bullet_fts.rowid
                 WHERE bullet_fts MATCH ?1
                 ORDER BY s
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![match_query, pool], map_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };

    Ok(rows)
}

/// Turn raw text (a whole job description) into a safe FTS5 MATCH query.
/// Raw text is NOT valid FTS5 syntax (`C++ (senior)` throws a syntax error),
/// so tokens are extracted, quoted, and OR-ed. Returns `None` when nothing
/// searchable survives.
fn fts_match_query(raw: &str) -> Option<String> {
    let mut seen = std::collections::HashSet::new();
    let mut tokens: Vec<String> = Vec::new();
    for tok in raw.to_lowercase().split(|c: char| !c.is_alphanumeric()) {
        if tok.chars().count() < 2 {
            continue;
        }
        if seen.insert(tok.to_string()) {
            tokens.push(format!("\"{}\"", tok));
            if tokens.len() >= 64 {
                break;
            }
        }
    }
    if tokens.is_empty() {
        None
    } else {
        Some(tokens.join(" OR "))
    }
}

/// Reciprocal Rank Fusion: score(bullet) = Σ_arms 1/(RRF_K + rank), with
/// 1-based ranks. Ties break on ascending id for determinism.
fn rrf_fuse(
    vector: Vec<(Candidate, f32)>,
    keyword: Vec<Candidate>,
    top_k: i64,
) -> Vec<RetrievedBullet> {
    let mut fused: std::collections::HashMap<i64, RetrievedBullet> = std::collections::HashMap::new();

    for (rank0, (c, distance)) in vector.into_iter().enumerate() {
        let contribution = 1.0 / (RRF_K + (rank0 + 1) as f64);
        let entry = fused.entry(c.id).or_insert_with(|| RetrievedBullet {
            id: c.id,
            experience_id: c.experience_id,
            content: c.content,
            sort_order: c.sort_order,
            score: 0.0,
            vector_distance: None,
            keyword_rank: None,
        });
        entry.score += contribution;
        entry.vector_distance = Some(distance);
    }

    for (rank0, c) in keyword.into_iter().enumerate() {
        let contribution = 1.0 / (RRF_K + (rank0 + 1) as f64);
        let entry = fused.entry(c.id).or_insert_with(|| RetrievedBullet {
            id: c.id,
            experience_id: c.experience_id,
            content: c.content,
            sort_order: c.sort_order,
            score: 0.0,
            vector_distance: None,
            keyword_rank: None,
        });
        entry.score += contribution;
        entry.keyword_rank = Some((rank0 + 1) as i64);
    }

    let mut results: Vec<RetrievedBullet> = fused.into_values().collect();
    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.id.cmp(&b.id))
    });
    results.truncate(top_k.max(0) as usize);
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        unsafe {
            rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
                sqlite_vec::sqlite3_vec_init as *const (),
            )));
        }
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn
    }

    fn fake_embedding(seed: f32) -> Vec<u8> {
        let v: Vec<f32> = (0..384).map(|i| ((i as f32) + seed) / 384.0).collect();
        crate::rag::commands::vec_to_bytes(&v)
    }

    fn cand(id: i64) -> Candidate {
        Candidate {
            id,
            experience_id: 1,
            content: format!("bullet {}", id),
            sort_order: 0,
        }
    }

    #[test]
    fn test_rrf_disagreeing_ranks() {
        // Asymmetric arm membership: A only in vector; B and C in both, with
        // C leading the keyword arm. C gets 1/63 + 1/61, B gets 1/62 + 1/62,
        // A gets 1/61 alone → C, B, A.
        let vector = vec![(cand(1), 0.1f32), (cand(2), 0.2), (cand(3), 0.3)];
        let keyword = vec![cand(3), cand(2)];

        let fused = rrf_fuse(vector, keyword, 10);
        let ids: Vec<i64> = fused.iter().map(|b| b.id).collect();
        assert_eq!(ids, vec![3, 2, 1]);

        assert_eq!(fused[0].keyword_rank, Some(1));
        assert_eq!(fused[0].vector_distance, Some(0.3));
        assert_eq!(fused[2].keyword_rank, None, "A was never in the keyword arm");
    }

    #[test]
    fn test_rrf_single_arm_degrades_to_arm_order() {
        let vector = vec![(cand(5), 0.1f32), (cand(9), 0.2), (cand(2), 0.3)];
        let fused = rrf_fuse(vector, Vec::new(), 10);
        let ids: Vec<i64> = fused.iter().map(|b| b.id).collect();
        assert_eq!(ids, vec![5, 9, 2], "no keyword arm → vector order preserved");

        let keyword = vec![cand(7), cand(4)];
        let fused = rrf_fuse(Vec::new(), keyword, 10);
        let ids: Vec<i64> = fused.iter().map(|b| b.id).collect();
        assert_eq!(ids, vec![7, 4], "no vector arm → keyword order preserved");
    }

    #[test]
    fn test_rrf_truncates_to_top_k() {
        let vector = vec![(cand(1), 0.1f32), (cand(2), 0.2), (cand(3), 0.3)];
        let fused = rrf_fuse(vector, Vec::new(), 2);
        assert_eq!(fused.len(), 2);
    }

    #[test]
    fn test_fts_match_query_sanitization() {
        let conn = test_conn();

        // Raw JD punctuation must not reach FTS5 as syntax.
        let q = fts_match_query("C++ / (Senior) Engineer!!").expect("should produce a query");
        assert!(q.contains("\"senior\""));
        assert!(q.contains("\"engineer\""));
        // Single-char tokens ("c") are dropped.
        assert!(!q.contains("\"c\""));

        // The sanitized query must actually execute against FTS5.
        keyword_candidates(&conn, &q, None, 10).expect("sanitized query should be valid FTS5");

        // Nothing searchable → None.
        assert!(fts_match_query("++ !!").is_none());
        assert!(fts_match_query("").is_none());

        // Raw text (unsanitized) really is invalid — guards against silently
        // weakening the sanitizer.
        assert!(keyword_candidates(&conn, "C++ (senior)", None, 10).is_err());
    }

    #[test]
    fn test_keyword_candidates_bm25_order_and_match() {
        let conn = test_conn();
        conn.execute(
            "INSERT INTO experiences (title, category) VALUES ('Job', 'job')",
            [],
        )
        .unwrap();
        let exp = conn.last_insert_rowid();
        for content in [
            "Optimized Kubernetes cluster autoscaling",
            "Wrote Terraform modules for AWS infrastructure",
            "Kubernetes Kubernetes operators for stateful workloads",
        ] {
            conn.execute(
                "INSERT INTO bullet_points (experience_id, content, sort_order) VALUES (?1, ?2, 0)",
                rusqlite::params![exp, content],
            )
            .unwrap();
        }

        let q = fts_match_query("kubernetes").unwrap();
        let rows = keyword_candidates(&conn, &q, None, 10).unwrap();
        assert_eq!(rows.len(), 2, "only the two kubernetes bullets match");
        for c in &rows {
            assert!(c.content.to_lowercase().contains("kubernetes"));
        }
    }

    #[test]
    fn test_archetype_filter_on_both_arms() {
        let conn = test_conn();

        // Two experiences, one bullet each; only exp1 is tagged to the archetype.
        conn.execute("INSERT INTO experiences (title, category) VALUES ('A', 'job')", []).unwrap();
        let exp1 = conn.last_insert_rowid();
        conn.execute("INSERT INTO experiences (title, category) VALUES ('B', 'job')", []).unwrap();
        let exp2 = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO bullet_points (experience_id, content, sort_order) VALUES (?1, 'Rust backend services', 0)",
            [exp1],
        ).unwrap();
        let b1 = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO bullet_points (experience_id, content, sort_order) VALUES (?1, 'Rust embedded firmware', 0)",
            [exp2],
        ).unwrap();
        let b2 = conn.last_insert_rowid();

        conn.execute("INSERT INTO archetypes (name) VALUES ('SWE')", []).unwrap();
        let arch = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO archetype_experiences (archetype_id, experience_id) VALUES (?1, ?2)",
            rusqlite::params![arch, exp1],
        )
        .unwrap();

        for (id, seed) in [(b1, 0.0f32), (b2, 1.0)] {
            conn.execute(
                "INSERT INTO bullet_embeddings (bullet_id, embedding) VALUES (?1, ?2)",
                rusqlite::params![id, fake_embedding(seed)],
            )
            .unwrap();
        }

        // Vector arm honors the filter.
        let query = fake_embedding(0.5);
        let vec_rows = vector_candidates(&conn, &query, Some(arch), 10).unwrap();
        assert_eq!(vec_rows.len(), 1);
        assert_eq!(vec_rows[0].0.id, b1);
        let vec_rows = vector_candidates(&conn, &query, None, 10).unwrap();
        assert_eq!(vec_rows.len(), 2, "no filter → both bullets");

        // Keyword arm honors the filter ("rust" matches both bullets).
        let q = fts_match_query("rust").unwrap();
        let kw_rows = keyword_candidates(&conn, &q, Some(arch), 10).unwrap();
        assert_eq!(kw_rows.len(), 1);
        assert_eq!(kw_rows[0].id, b1);
        let kw_rows = keyword_candidates(&conn, &q, None, 10).unwrap();
        assert_eq!(kw_rows.len(), 2, "no filter → both bullets");

        // Directly-tagged bullets pass the filter too.
        conn.execute(
            "INSERT INTO archetype_bullets (archetype_id, bullet_point_id) VALUES (?1, ?2)",
            rusqlite::params![arch, b2],
        )
        .unwrap();
        let kw_rows = keyword_candidates(&conn, &q, Some(arch), 10).unwrap();
        assert_eq!(kw_rows.len(), 2, "direct bullet tag also passes the filter");
    }
}
