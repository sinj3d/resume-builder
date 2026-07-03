//! Auto-download of the specialized, local resume-parsing model.
//!
//! Mirrors the tectonic binary download pattern ([`crate::latex::download`]): the
//! model lives in the app-data directory, is fetched once on first use, and every
//! run after that is fully offline. We stream to a temp file and rename on success
//! so an interrupted download never leaves a corrupt model in place.

use futures_util::StreamExt;
use reqwest::Client;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Qwen2.5-1.5B-Instruct, Q4_K_M quantization (~1.1 GB). Small enough to run on
/// CPU, strong enough to emit reliable structured JSON. Swap this pair to change
/// the parser model.
const PARSER_MODEL_URL: &str =
    "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf";
const PARSER_MODEL_FILENAME: &str = "qwen2.5-1.5b-instruct-q4_k_m.gguf";

/// Resolve the on-disk path for the parser model (whether or not it exists yet).
pub fn parser_model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    Ok(app_data_dir.join("models").join(PARSER_MODEL_FILENAME))
}

/// Ensure the parser model is present locally, downloading it on first use.
/// Returns the path to the ready-to-load `.gguf` file.
pub async fn ensure_parser_model(app: &AppHandle) -> Result<PathBuf, String> {
    let model_path = parser_model_path(app)?;
    if model_path.exists() {
        return Ok(model_path);
    }

    let model_dir = model_path
        .parent()
        .ok_or_else(|| "Invalid model path".to_string())?;
    fs::create_dir_all(model_dir).map_err(|e| format!("Failed to create model dir: {}", e))?;

    // Stream to a temporary sibling file so a partial download can't masquerade
    // as a complete model.
    let tmp_path = model_dir.join(format!("{}.part", PARSER_MODEL_FILENAME));

    let client = Client::new();
    let res = client
        .get(PARSER_MODEL_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to start model download: {}", e))?;

    if !res.status().is_success() {
        return Err(format!(
            "Failed to download parser model: HTTP {}",
            res.status()
        ));
    }

    let mut file =
        fs::File::create(&tmp_path).map_err(|e| format!("Failed to create model file: {}", e))?;

    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Error while downloading model: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write model chunk: {}", e))?;
    }
    file.flush().map_err(|e| format!("Failed to flush model file: {}", e))?;
    drop(file);

    fs::rename(&tmp_path, &model_path)
        .map_err(|e| format!("Failed to finalize downloaded model: {}", e))?;

    Ok(model_path)
}
