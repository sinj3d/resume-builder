use serde::Serialize;
use tauri::{AppHandle, State};

use crate::db::DbState;
use crate::llm::{LlmState, LlmSettings};
use crate::rag::EmbeddingState;

/// Result returned by the cover letter generation command.
#[derive(Debug, Serialize)]
pub struct GenerationResult {
    pub cover_letter: String,
    pub bullets_used: Vec<String>,
    pub prompt: String,
}

/// Generate a cover letter from a job description using RAG + LLM.
///
/// 1. Embed the JD and retrieve the top-k most relevant bullets (optionally filtered by archetype).
/// 2. Build a zero-hallucination prompt with the retrieved bullets.
/// 3. Send the prompt to the active LLM provider (cloud or local).
#[tauri::command]
pub async fn generate_cover_letter(
    db_state: State<'_, DbState>,
    emb_state: State<'_, EmbeddingState>,
    llm_state: State<'_, LlmState>,
    job_description: String,
    archetype_id: Option<i64>,
    top_k: Option<i32>,
) -> Result<GenerationResult, String> {
    let k = top_k.unwrap_or(10);

    // Step 1: Embed the JD and retrieve relevant bullets
    let bullets: Vec<String> = {
        let mut model = emb_state.0.lock().map_err(|e| e.to_string())?;
        let conn = db_state.0.lock().map_err(|e| e.to_string())?;

        let query_embedding = model
            .embed(&job_description)
            .map_err(|e| format!("Embedding failed: {}", e))?;

        let query_bytes: Vec<u8> = query_embedding.iter().flat_map(|f| f.to_le_bytes()).collect();

        // Build SQL based on whether we're filtering by archetype
        if let Some(arch_id) = archetype_id {
            let mut stmt = conn
                .prepare(
                    "SELECT bp.content
                     FROM bullet_embeddings be
                     INNER JOIN bullet_points bp ON bp.id = be.bullet_id
                     INNER JOIN archetype_bullets ab ON ab.bullet_point_id = bp.id
                     WHERE be.embedding MATCH ?1
                       AND k = ?2
                       AND ab.archetype_id = ?3
                     ORDER BY be.distance",
                )
                .map_err(|e| e.to_string())?;

            let rows: Vec<String> = stmt
                .query_map(rusqlite::params![query_bytes, k, arch_id], |row| {
                    row.get(0)
                })
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            rows
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT bp.content
                     FROM bullet_embeddings be
                     INNER JOIN bullet_points bp ON bp.id = be.bullet_id
                     WHERE be.embedding MATCH ?1
                       AND k = ?2
                     ORDER BY be.distance",
                )
                .map_err(|e| e.to_string())?;

            let rows: Vec<String> = stmt
                .query_map(rusqlite::params![query_bytes, k], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            rows
        }
    };

    // Step 2: Build the prompt
    let prompt = crate::llm::prompt::build_prompt(&bullets, &job_description);

    // Step 3: Send to the active LLM provider
    let settings = {
        llm_state.0.lock().map_err(|e| e.to_string())?.clone()
    };

    let cover_letter = match settings.mode.as_str() {
        "local" => {
            let path = settings
                .gguf_path
                .as_deref()
                .ok_or("No GGUF model path configured. Please set one in Settings.")?;
            crate::llm::generate_local(&prompt, path)?
        }
        "cloud" | _ => {
            let key = settings
                .api_key
                .as_deref()
                .ok_or("No API key configured. Please set one in Settings.")?;
            let model_name = settings
                .cloud_model
                .as_deref()
                .unwrap_or("gemini-2.5-flash");
            crate::llm::generate_cloud(&prompt, key, model_name)
                .await
                .map_err(|e| format!("Cloud generation failed: {}", e))?
        }
    };

    Ok(GenerationResult {
        cover_letter,
        bullets_used: bullets,
        prompt,
    })
}

/// Get the current LLM settings.
#[tauri::command]
pub fn get_llm_settings(
    llm_state: State<'_, LlmState>,
) -> Result<LlmSettings, String> {
    let settings = llm_state.0.lock().map_err(|e| e.to_string())?;
    // Mask the API key for security
    let mut safe = settings.clone();
    if let Some(ref key) = safe.api_key {
        if key.len() > 8 {
            safe.api_key = Some(format!("{}...{}", &key[..4], &key[key.len()-4..]));
        }
    }
    Ok(safe)
}

/// Update LLM settings and persist them.
///
/// Note: `get_llm_settings` returns a *masked* API key, so the frontend never
/// echoes the real key back. An empty/absent `api_key` here therefore means
/// "leave the stored key unchanged" rather than "delete it" — otherwise a routine
/// settings save would wipe (or corrupt with the mask) a previously saved key.
/// Likewise, an absent `cloud_model` preserves the current one.
#[tauri::command]
pub fn update_llm_settings(
    db_state: State<'_, DbState>,
    llm_state: State<'_, LlmState>,
    mode: String,
    gguf_path: Option<String>,
    api_key: Option<String>,
    cloud_model: Option<String>,
) -> Result<(), String> {
    let mut settings = llm_state.0.lock().map_err(|e| e.to_string())?;

    let merged = LlmSettings {
        mode,
        gguf_path,
        api_key: match api_key {
            Some(k) if !k.is_empty() => Some(k),
            _ => settings.api_key.clone(),
        },
        cloud_model: cloud_model.or_else(|| settings.cloud_model.clone()),
    };

    // Persist to DB
    {
        let conn = db_state.0.lock().map_err(|e| e.to_string())?;
        crate::llm::save_settings(&conn, &merged)?;
    }

    // Update in-memory state
    *settings = merged;

    Ok(())
}

/// Ensure the specialized local parser model is downloaded. Safe to call ahead of
/// time (e.g. from the onboarding screen) so the first import isn't blocked on a
/// ~1 GB download. No-op if the model already exists.
#[tauri::command]
pub async fn check_or_download_parser_model(app: AppHandle) -> Result<(), String> {
    crate::llm::model::ensure_parser_model(&app).await.map(|_| ())
}

/// Extract resume text from a PDF and parse it into structured JSON experiences.
///
/// This is **local-only** and fully offline after the first run: it downloads a
/// small specialized parser model on first use, then runs it on-device. It never
/// contacts a cloud provider, regardless of the configured LLM mode. The returned
/// string is already clean, validated JSON (`{ "experiences": [...] }`).
#[tauri::command]
pub async fn extract_resume_pdf(
    app: AppHandle,
    pdf_path: String,
) -> Result<String, String> {
    // 1. Extract text from the PDF.
    let text = pdf_extract::extract_text(&pdf_path)
        .map_err(|e| format!("Failed to read PDF text: {}", e))?;
    if text.trim().is_empty() {
        return Err(
            "No text could be extracted from this PDF. It may be a scanned or image-only document."
                .to_string(),
        );
    }

    // 2. Ensure the specialized local parser model is available (downloads once).
    let model_path = crate::llm::model::ensure_parser_model(&app).await?;
    let model_path_str = model_path
        .to_str()
        .ok_or("Parser model path is not valid UTF-8.")?
        .to_string();

    // 3. Run the model. llama-cpp is synchronous and CPU-heavy, so run it on a
    //    blocking thread to keep the async runtime responsive.
    let prompt = crate::llm::parse::build_parse_prompt(&text);
    let raw = tauri::async_runtime::spawn_blocking(move || {
        crate::llm::generate_local_parse(&prompt, &model_path_str)
    })
    .await
    .map_err(|e| format!("Parser task failed to run: {}", e))??;

    // 4. Recover and validate clean JSON from the model output.
    let json = crate::llm::parse::extract_json_object(&raw)?;
    crate::llm::parse::validate_experiences(&json)?;

    Ok(json)
}
