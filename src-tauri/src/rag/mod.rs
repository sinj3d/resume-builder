pub mod commands;

use ndarray::Array2;
use ort::session::Session;
use std::path::Path;
use std::sync::Mutex;
use tokenizers::Tokenizer;

/// Holds the loaded ONNX model and tokenizer, managed by Tauri state.
pub struct EmbeddingState(pub Mutex<EmbeddingModel>);

/// The embedding model: an ONNX session + tokenizer for all-MiniLM-L6-v2.
pub struct EmbeddingModel {
    session: Session,
    tokenizer: Tokenizer,
}

impl EmbeddingModel {
    /// Load the ONNX model and tokenizer from the given directory.
    pub fn load(model_dir: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let model_path = model_dir.join("model.onnx");
        let tokenizer_path = model_dir.join("tokenizer.json");

        let session = Session::builder()?
            .with_intra_threads(4)?
            .commit_from_file(&model_path)?;

        let tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| format!("Failed to load tokenizer: {}", e))?;

        Ok(Self { session, tokenizer })
    }

    /// Embed a text string into a 384-dimensional normalized float vector.
    pub fn embed(&mut self, text: &str) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
        // Tokenize
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| format!("Tokenization failed: {}", e))?;

        let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
        let attention_mask: Vec<i64> = encoding
            .get_attention_mask()
            .iter()
            .map(|&m| m as i64)
            .collect();
        let token_type_ids: Vec<i64> = encoding
            .get_type_ids()
            .iter()
            .map(|&t| t as i64)
            .collect();

        let seq_len = input_ids.len();

        // Create 2D ndarray arrays [1, seq_len] then convert to ort::Value
        let ids_array = Array2::from_shape_vec((1, seq_len), input_ids)?;
        let mask_array = Array2::from_shape_vec((1, seq_len), attention_mask.clone())?;
        let type_array = Array2::from_shape_vec((1, seq_len), token_type_ids)?;

        let ids_value = ort::value::Value::from_array(ids_array)?;
        let mask_value = ort::value::Value::from_array(mask_array)?;
        let type_value = ort::value::Value::from_array(type_array)?;

        // Run inference
        let outputs = self.session.run(ort::inputs![
            "input_ids" => ids_value,
            "attention_mask" => mask_value,
            "token_type_ids" => type_value,
        ])?;

        // Extract token embeddings (shape: [1, seq_len, 384])
        let (output_shape, output_data) = outputs[0].try_extract_tensor::<f32>()?;

        // Mean pooling with attention mask
        let hidden_size = *output_shape.last().unwrap_or(&384) as usize;
        let mut pooled = vec![0.0f32; hidden_size];
        let mut mask_sum = 0.0f32;

        for tok_idx in 0..seq_len {
            let mask_val = attention_mask[tok_idx] as f32;
            if mask_val > 0.0 {
                mask_sum += mask_val;
                for dim in 0..hidden_size {
                    pooled[dim] += output_data[tok_idx * hidden_size + dim] * mask_val;
                }
            }
        }

        if mask_sum > 0.0 {
            for dim in 0..hidden_size {
                pooled[dim] /= mask_sum;
            }
        }

        // L2 normalize
        let norm: f32 = pooled.iter().map(|v| v * v).sum::<f32>().sqrt();
        if norm > 0.0 {
            for v in &mut pooled {
                *v /= norm;
            }
        }

        Ok(pooled)
    }
}
