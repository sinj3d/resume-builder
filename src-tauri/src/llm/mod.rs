pub mod commands;
pub mod model;
pub mod parse;
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

/// Input for local generation: either a preformatted raw prompt (the resume
/// parser builds its own ChatML) or system/user chat parts to be formatted with
/// the model's own chat template after the GGUF is loaded.
#[cfg(feature = "local-llm")]
enum LocalInput<'a> {
    Raw { prompt: &'a str, add_bos: bool },
    Chat { system: &'a str, user: &'a str },
}

/// Run a local GGUF model via llama-cpp-2 with greedy decoding.
///
/// Shared by cover-letter generation and resume parsing. The context is sized to
/// hold the prompt plus `max_tokens` of output, so long resumes don't overflow.
/// For `Chat` input the prompt is formatted with the GGUF's embedded chat
/// template (falling back to llama.cpp's builtin "chatml", then to a manual
/// ChatML string), so a fine-tuned chat model sees exactly the format it was
/// trained on.
///
/// Only available when compiled with the `local-llm` feature.
#[cfg(feature = "local-llm")]
fn run_local_generation(
    input: LocalInput,
    gguf_path: &str,
    max_tokens: i32,
) -> Result<String, String> {
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::model::LlamaModel;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::{AddBos, LlamaChatMessage, LlamaChatTemplate};
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

    // Resolve the input to a prompt string + BOS policy. Chat input is formatted
    // with the model's chat template; special tokens are then parsed during
    // tokenization, so no extra BOS is prepended (same as the parser path).
    let (prompt, add_bos) = match input {
        LocalInput::Raw { prompt, add_bos } => (prompt.to_string(), add_bos),
        LocalInput::Chat { system, user } => {
            let messages = vec![
                LlamaChatMessage::new("system".to_string(), system.to_string())
                    .map_err(|e| format!("Invalid system message: {}", e))?,
                LlamaChatMessage::new("user".to_string(), user.to_string())
                    .map_err(|e| format!("Invalid user message: {}", e))?,
            ];

            // Embedded template first, then llama.cpp's builtin ChatML.
            let template = model
                .chat_template(None)
                .ok()
                .or_else(|| LlamaChatTemplate::new("chatml").ok());
            let formatted = template
                .and_then(|tmpl| model.apply_chat_template(&tmpl, &messages, true).ok());

            let prompt = match formatted {
                Some(p) => p,
                // Last resort: manual ChatML, the same shape the parser uses.
                None => format!(
                    "<|im_start|>system\n{}<|im_end|>\n<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n",
                    system, user
                ),
            };
            (prompt, false)
        }
    };

    // Tokenize the prompt first so we can size the context to fit prompt + output.
    let bos = if add_bos { AddBos::Always } else { AddBos::Never };
    let tokens = model.str_to_token(&prompt, bos)
        .map_err(|e| format!("Tokenization failed: {}", e))?;

    // Context large enough for the prompt plus the requested generation budget,
    // clamped to a sane range.
    let needed = tokens.len() as u32 + max_tokens as u32 + 16;
    let n_ctx = needed.clamp(2048, 8192);
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(Some(NonZeroU32::new(n_ctx).unwrap()));
    let mut ctx = model.new_context(&backend, ctx_params)
        .map_err(|e| format!("Failed to create context: {}", e))?;

    if tokens.is_empty() {
        return Err("Prompt tokenized to zero tokens.".to_string());
    }

    // Create batch and evaluate prompt tokens
    let batch_cap = (tokens.len() + 1).max(512);
    let mut batch = LlamaBatch::new(batch_cap, 1);
    let last_index = (tokens.len() - 1) as i32;
    for (i, token) in (0i32..).zip(tokens.iter().copied()) {
        let is_last = i == last_index;
        batch.add(token, i, &[0], is_last)
            .map_err(|e| format!("Failed to add token to batch: {}", e))?;
    }

    ctx.decode(&mut batch)
        .map_err(|e| format!("Initial decode failed: {}", e))?;

    // Set up sampler (greedy decoding for deterministic output)
    let mut sampler = LlamaSampler::chain_simple([
        LlamaSampler::dist(1234),
        LlamaSampler::greedy(),
    ]);

    // Generate tokens
    let mut output = String::new();
    let mut n_cur = batch.n_tokens();
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

/// Generate a cover letter with a user-supplied local GGUF model. The
/// system/user parts are formatted with the model's own chat template.
#[cfg(feature = "local-llm")]
pub fn generate_local_chat(system: &str, user: &str, gguf_path: &str) -> Result<String, String> {
    run_local_generation(LocalInput::Chat { system, user }, gguf_path, 1024)
}

/// Parse a resume with the specialized, auto-downloaded parser model.
/// Uses a larger output budget and ChatML (no BOS) since the model is a chat model.
#[cfg(feature = "local-llm")]
pub fn generate_local_parse(prompt: &str, gguf_path: &str) -> Result<String, String> {
    run_local_generation(LocalInput::Raw { prompt, add_bos: false }, gguf_path, 2048)
}

/// Stub for when the local-llm feature is not enabled.
#[cfg(not(feature = "local-llm"))]
pub fn generate_local_chat(_system: &str, _user: &str, _gguf_path: &str) -> Result<String, String> {
    Err("Local LLM support is not enabled. Recompile with `--features local-llm` (requires cmake).".to_string())
}

/// Stub for when the local-llm feature is not enabled.
#[cfg(not(feature = "local-llm"))]
pub fn generate_local_parse(_prompt: &str, _gguf_path: &str) -> Result<String, String> {
    Err("Local resume parsing requires the app to be built with the `local-llm` feature (requires cmake).".to_string())
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
