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
    pub cover_letter_id: i64,
}

/// Progress events streamed over an IPC channel while a letter generates.
/// The awaited command promise still delivers the final `GenerationResult`
/// (with the contact header prepended and the letter persisted); the channel
/// only carries progress — `Started` fires the moment retrieval finishes,
/// `Token` carries raw body chunks as the model produces them.
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum GenerationEvent {
    #[serde(rename_all = "camelCase")]
    Started { bullets_used: Vec<String> },
    #[serde(rename_all = "camelCase")]
    Token { chunk: String },
}

/// Error prefix the frontend uses to show a "don't waste your time" popup
/// instead of the generic error banner.
pub const NO_MATCHES_PREFIX: &str = "NO_MATCHES::";

/// Generate a cover letter from a job description using RAG + LLM.
///
/// 1. Retrieve the top-k most relevant bullets via hybrid search (semantic
///    KNN + FTS5 keyword, RRF-fused; self-heals missing embeddings first).
/// 2. Build a zero-hallucination prompt (optionally conditioned on a cover
///    letter template) and send it to the active provider.
/// 3. Prepend the bio contact header and persist the letter to history.
#[tauri::command]
pub async fn generate_cover_letter(
    db_state: State<'_, DbState>,
    emb_state: State<'_, EmbeddingState>,
    llm_state: State<'_, LlmState>,
    job_description: String,
    archetype_id: Option<i64>,
    top_k: Option<i32>,
    template_id: Option<i64>,
    on_event: tauri::ipc::Channel<GenerationEvent>,
) -> Result<GenerationResult, String> {
    let k = top_k.unwrap_or(10) as i64;
    // Archetype 0 is the frontend's "Any / General" choice — no filter.
    let arch_filter = archetype_id.filter(|id| *id > 0);
    // Template 0 is the frontend's "No template (default)" choice.
    let tmpl_filter = template_id.filter(|id| *id > 0);

    // Step 1: retrieve relevant bullets via hybrid search.
    let (bullets, bio, template) = {
        let mut model = emb_state.0.lock().map_err(|e| e.to_string())?;
        let conn = db_state.0.lock().map_err(|e| e.to_string())?;

        let bullets: Vec<String> =
            crate::rag::retrieval::retrieve_hybrid(&conn, &mut model, &job_description, arch_filter, k)?
                .into_iter()
                .map(|b| b.content)
                .collect();

        let bio: crate::db::models::Bio = conn
            .query_row(
                "SELECT name, email, phone, location, linkedin, github, website FROM bio WHERE id = 1",
                [],
                |row| {
                    Ok(crate::db::models::Bio {
                        name: row.get(0).ok(),
                        email: row.get(1).ok(),
                        phone: row.get(2).ok(),
                        location: row.get(3).ok(),
                        linkedin: row.get(4).ok(),
                        github: row.get(5).ok(),
                        website: row.get(6).ok(),
                    })
                },
            )
            .unwrap_or(crate::db::models::Bio {
                name: None,
                email: None,
                phone: None,
                location: None,
                linkedin: None,
                github: None,
                website: None,
            });

        // A selected-but-missing template is a hard error rather than a silent
        // fallback — the user asked for a specific style.
        let template: Option<String> = match tmpl_filter {
            Some(id) => Some(
                conn.query_row(
                    "SELECT content FROM cover_letter_templates WHERE id = ?1",
                    [id],
                    |row| row.get(0),
                )
                .map_err(|e| match e {
                    rusqlite::Error::QueryReturnedNoRows => {
                        "Selected template no longer exists — pick another one in the Template dropdown.".to_string()
                    }
                    other => other.to_string(),
                })?,
            ),
            None => None,
        };

        (bullets, bio, template)
    };

    // Don't waste the user's time generating a letter with nothing to say.
    if bullets.is_empty() {
        return Err(format!(
            "{}No relevant experiences were found for this job description. \
             Make sure the selected archetype has experiences tagged to it \
             (or pick \"Any / General\"), and that those experiences have bullet points.",
            NO_MATCHES_PREFIX
        ));
    }

    // Progress events are best-effort: a closed webview must not fail a
    // generation that will still be persisted to history.
    let _ = on_event.send(GenerationEvent::Started {
        bullets_used: bullets.clone(),
    });

    // Step 2: Build the prompt (system/user parts; local mode feeds them through
    // the model's chat template, cloud mode and the UI use the joined string).
    let parts = crate::llm::prompt::build_prompt_parts(
        &bullets,
        &job_description,
        template.as_deref(),
        bio.name.as_deref(),
    );
    let prompt = parts.joined();

    let settings = {
        llm_state.0.lock().map_err(|e| e.to_string())?.clone()
    };

    let letter_body = match settings.mode.as_str() {
        "local" => {
            let path = settings
                .gguf_path
                .clone()
                .ok_or("No GGUF model path configured. Please set one in Settings.")?;
            // llama-cpp is synchronous and CPU-heavy — run it on a blocking
            // thread to keep the async runtime responsive (same pattern as
            // extract_resume_pdf).
            let (system, user) = (parts.system.clone(), parts.user.clone());
            let channel = on_event.clone();
            tauri::async_runtime::spawn_blocking(move || {
                crate::llm::generate_local_chat(&system, &user, &path, |piece| {
                    let _ = channel.send(GenerationEvent::Token {
                        chunk: piece.to_string(),
                    });
                })
            })
            .await
            .map_err(|e| format!("Local generation task failed to run: {}", e))??
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
            let body = crate::llm::generate_cloud(&prompt, key, model_name)
                .await
                .map_err(|e| format!("Cloud generation failed: {}", e))?;
            // Gemini is called non-streaming; deliver the body as one chunk so
            // the frontend has a single code path.
            let _ = on_event.send(GenerationEvent::Token { chunk: body.clone() });
            body
        }
    };

    // Step 3: Prepend the contact header deterministically (never trust the
    // model with contact details), then persist to history.
    let mut header_lines: Vec<String> = Vec::new();
    if let Some(name) = bio.name.as_deref().filter(|s| !s.is_empty()) {
        header_lines.push(name.to_string());
    }
    let contact: Vec<String> = [&bio.location, &bio.email, &bio.phone]
        .iter()
        .filter_map(|f| f.as_deref())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    if !contact.is_empty() {
        header_lines.push(contact.join(" | "));
    }

    let cover_letter = if header_lines.is_empty() {
        letter_body.trim().to_string()
    } else {
        format!("{}\n\n{}", header_lines.join("\n"), letter_body.trim())
    };

    let cover_letter_id = {
        let conn = db_state.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO cover_letters (archetype_id, job_description, content) VALUES (?1, ?2, ?3)",
            rusqlite::params![arch_filter, job_description, cover_letter],
        )
        .map_err(|e| format!("Failed to save cover letter to history: {}", e))?;
        conn.last_insert_rowid()
    };

    Ok(GenerationResult {
        cover_letter,
        bullets_used: bullets,
        prompt,
        cover_letter_id,
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

/// Progress events streamed over an IPC channel while the fine-tuned cover-letter
/// model downloads. The awaited command promise still resolves to the final local
/// path; the channel only carries progress. `total` is null when the server sends
/// no `Content-Length`, in which case the UI shows an indeterminate state.
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Progress { downloaded: u64, total: Option<u64> },
}

/// Download the fine-tuned cover-letter model (or return its path if it's already
/// present), streaming progress over `on_event`. The resolved path is ready to
/// store as the `gguf_path` setting — the frontend saves it after the download so
/// local mode works immediately.
#[tauri::command]
pub async fn download_coverletter_model(
    app: AppHandle,
    on_event: tauri::ipc::Channel<DownloadEvent>,
) -> Result<String, String> {
    // Throttle emission so a 1.8 GB download doesn't fire an event per TCP chunk:
    // send on each whole-percent change when the size is known, else every ~8 MB.
    let mut last_pct: i64 = -1;
    let mut last_bytes: u64 = 0;
    let path = crate::llm::model::ensure_coverletter_model(&app, |downloaded, total| {
        let should_emit = match total {
            Some(t) if t > 0 => {
                let pct = ((downloaded as f64 / t as f64) * 100.0) as i64;
                if pct != last_pct {
                    last_pct = pct;
                    true
                } else {
                    false
                }
            }
            _ => {
                if downloaded == 0 || downloaded - last_bytes >= 8 * 1024 * 1024 {
                    last_bytes = downloaded;
                    true
                } else {
                    false
                }
            }
        };
        if should_emit {
            let _ = on_event.send(DownloadEvent::Progress { downloaded, total });
        }
    })
    .await?;

    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Downloaded model path is not valid UTF-8.".to_string())
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
