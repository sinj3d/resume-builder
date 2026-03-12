use serde::Serialize;
use tauri::State;

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
                .unwrap_or("gemini-2.0-flash");
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
#[tauri::command]
pub fn update_llm_settings(
    db_state: State<'_, DbState>,
    llm_state: State<'_, LlmState>,
    mode: String,
    gguf_path: Option<String>,
    api_key: Option<String>,
    cloud_model: Option<String>,
) -> Result<(), String> {
    let new_settings = LlmSettings {
        mode,
        gguf_path,
        api_key,
        cloud_model,
    };

    // Persist to DB
    let conn = db_state.0.lock().map_err(|e| e.to_string())?;
    crate::llm::save_settings(&conn, &new_settings)?;

    // Update in-memory state
    let mut settings = llm_state.0.lock().map_err(|e| e.to_string())?;
    *settings = new_settings;

    Ok(())
}

/// Extract resume text from a PDF and parse it into structured JSON experiences using the Cloud LLM.
#[tauri::command]
pub async fn extract_resume_pdf(
    llm_state: State<'_, LlmState>,
    pdf_path: String,
) -> Result<String, String> {
    let settings = {
        llm_state.0.lock().map_err(|e| e.to_string())?.clone()
    };

    let key = settings
        .api_key
        .as_deref()
        .ok_or("No API key configured. You must set a Cloud API Key in Settings for PDF parsing.")?;
    
    let model_name = settings
        .cloud_model
        .as_deref()
        .unwrap_or("gemini-2.0-flash");

    // Extract text from PDF
    let text = pdf_extract::extract_text(&pdf_path)
        .map_err(|e| format!("Failed to read PDF text: {}", e))?;

    let prompt = format!(
        "System: You are an expert Applicant Tracking System (ATS). Parse the following resume text into a strict JSON payload. Return ONLY raw JSON, no markdown formatting blocks like ```json.
The JSON must follow this exact exact schema:
{{
  \"experiences\": [
    {{
      \"title\": \"Role Title\",
      \"org\": \"Organization/Company\",
      \"start_date\": \"String (e.g. Jan 2020)\",
      \"end_date\": \"String (e.g. Present)\",
      \"category\": \"String (Work, Project, Education)\",
      \"bullets\": [
        \"Accomplishment 1\",
        \"Accomplishment 2\"
      ]
    }}
  ]
}}

Resume Text:
{}
",
        text
    );

    crate::llm::generate_cloud(&prompt, key, model_name)
        .await
        .map_err(|e| format!("Cloud parsing failed: {}", e))
}
