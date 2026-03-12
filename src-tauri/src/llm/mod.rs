pub mod commands;
pub mod prompt;

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// LLM settings persisted in the database.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmSettings {
    /// "local" or "cloud"
    pub mode: String,
    /// Path to a GGUF model file (for local mode)
    pub gguf_path: Option<String>,
    /// API key for cloud provider (Gemini)
    pub api_key: Option<String>,
    /// Cloud model name (default: "gemini-2.0-flash")
    pub cloud_model: Option<String>,
}

impl Default for LlmSettings {
    fn default() -> Self {
        Self {
            mode: "cloud".to_string(),
            gguf_path: None,
            api_key: None,
            cloud_model: Some("gemini-2.5-flash".to_string()),
        }
    }
}

/// Tauri-managed state holding the current LLM settings.
pub struct LlmState(pub Mutex<LlmSettings>);

/// Generate text using the Gemini REST API.
pub async fn generate_cloud(
    prompt: &str,
    api_key: &str,
    model: &str,
) -> Result<String, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );

    let body = serde_json::json!({
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 8192,
        }
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("API error ({}): {}", status, response_text));
    }

    // Parse the Gemini response
    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Extract generated text from response
    let text = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| format!("Unexpected API response structure: {}", response_text))?;

    Ok(text.to_string())
}

/// Generate text using a local GGUF model via llama-cpp-2.
/// This is only available when compiled with the `local-llm` feature.
#[cfg(feature = "local-llm")]
pub fn generate_local(prompt: &str, gguf_path: &str) -> Result<String, String> {
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::model::LlamaModel;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::AddBos;
    use llama_cpp_2::context::params::LlamaContextParams;
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::sampling::LlamaSampler;
    use std::num::NonZeroU32;
    use std::pin::pin;

    // Initialize the backend
    let backend = LlamaBackend::init()
        .map_err(|e| format!("Failed to init llama backend: {}", e))?;

    // Load the model
    let model_params = pin!(LlamaModelParams::default());
    let model = LlamaModel::load_from_file(&backend, gguf_path, &model_params)
        .map_err(|e| format!("Failed to load GGUF model: {}", e))?;

    // Create context
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(Some(NonZeroU32::new(2048).unwrap()));
    let mut ctx = model.new_context(&backend, ctx_params)
        .map_err(|e| format!("Failed to create context: {}", e))?;

    // Tokenize the prompt
    let tokens = model.str_to_token(prompt, AddBos::Always)
        .map_err(|e| format!("Tokenization failed: {}", e))?;

    // Create batch and evaluate prompt tokens
    let mut batch = LlamaBatch::new(2048, 1);
    let last_index = (tokens.len() - 1) as i32;
    for (i, token) in (0i32..).zip(tokens.iter().copied()) {
        let is_last = i == last_index;
        batch.add(token, i, &[0], is_last)
            .map_err(|e| format!("Failed to add token to batch: {}", e))?;
    }

    ctx.decode(&mut batch)
        .map_err(|e| format!("Initial decode failed: {}", e))?;

    // Set up sampler (greedy decoding)
    let mut sampler = LlamaSampler::chain_simple([
        LlamaSampler::dist(1234),
        LlamaSampler::greedy(),
    ]);

    // Generate tokens
    let mut output = String::new();
    let mut n_cur = batch.n_tokens();
    let max_tokens = 1024i32;
    let mut decoder = encoding_rs::UTF_8.new_decoder();

    for _ in 0..max_tokens {
        let token = sampler.sample(&ctx, batch.n_tokens() - 1);
        sampler.accept(token);

        if model.is_eog_token(token) {
            break;
        }

        let piece = model.token_to_piece(token, &mut decoder, true, None)
            .map_err(|e| format!("Token to piece failed: {}", e))?;
        output.push_str(&piece);

        batch.clear();
        batch.add(token, n_cur, &[0], true)
            .map_err(|e| format!("Failed to add generated token: {}", e))?;

        ctx.decode(&mut batch)
            .map_err(|e| format!("Decode step failed: {}", e))?;

        n_cur += 1;
    }

    Ok(output)
}

/// Stub for when local-llm feature is not enabled.
#[cfg(not(feature = "local-llm"))]
pub fn generate_local(_prompt: &str, _gguf_path: &str) -> Result<String, String> {
    Err("Local LLM support is not enabled. Recompile with `--features local-llm` (requires cmake).".to_string())
}

/// Load LLM settings from the database, or return defaults.
pub fn load_settings(conn: &rusqlite::Connection) -> LlmSettings {
    let result = conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'llm_settings'",
        [],
        |row| row.get::<_, String>(0),
    );

    match result {
        Ok(json_str) => serde_json::from_str(&json_str).unwrap_or_default(),
        Err(_) => LlmSettings::default(),
    }
}

/// Persist LLM settings to the database.
pub fn save_settings(
    conn: &rusqlite::Connection,
    settings: &LlmSettings,
) -> Result<(), String> {
    let json = serde_json::to_string(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('llm_settings', ?1)",
        [&json],
    )
    .map_err(|e| format!("Failed to save settings: {}", e))?;

    Ok(())
}
