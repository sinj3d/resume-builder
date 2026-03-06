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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// Resolve the model directory relative to the crate root.
    fn model_dir() -> PathBuf {
        let manifest = std::env::var("CARGO_MANIFEST_DIR")
            .expect("CARGO_MANIFEST_DIR not set");
        PathBuf::from(manifest).join("resources").join("model")
    }

    #[test]
    fn test_model_loads() {
        let dir = model_dir();
        assert!(dir.join("model.onnx").exists(), "model.onnx not found at {:?}", dir);
        assert!(dir.join("tokenizer.json").exists(), "tokenizer.json not found at {:?}", dir);
        let _model = EmbeddingModel::load(&dir).expect("Failed to load embedding model");
    }

    #[test]
    fn test_embed_produces_384d_normalized_vector() {
        let dir = model_dir();
        let mut model = EmbeddingModel::load(&dir).unwrap();

        let embedding = model.embed("Built a REST API serving 10k requests per second").unwrap();

        // Check dimension
        assert_eq!(embedding.len(), 384, "Embedding should be 384-dimensional");

        // Check L2 norm ≈ 1.0 (normalized)
        let norm: f32 = embedding.iter().map(|v| v * v).sum::<f32>().sqrt();
        assert!(
            (norm - 1.0).abs() < 0.01,
            "Embedding should be L2-normalized, got norm = {}",
            norm
        );

        // Check not all zeros
        let sum: f32 = embedding.iter().map(|v| v.abs()).sum();
        assert!(sum > 0.1, "Embedding should not be all zeros");
    }

    #[test]
    fn test_similar_texts_have_higher_cosine_similarity() {
        let dir = model_dir();
        let mut model = EmbeddingModel::load(&dir).unwrap();

        let emb_a = model.embed("Developed a machine learning pipeline for NLP").unwrap();
        let emb_b = model.embed("Built an ML system for natural language processing").unwrap();
        let emb_c = model.embed("Baked chocolate chip cookies for the office party").unwrap();

        // Cosine similarity (vectors are already L2-normalized, so dot product = cosine sim)
        let sim_ab: f32 = emb_a.iter().zip(emb_b.iter()).map(|(a, b)| a * b).sum();
        let sim_ac: f32 = emb_a.iter().zip(emb_c.iter()).map(|(a, b)| a * b).sum();

        assert!(
            sim_ab > sim_ac,
            "Similar texts should have higher cosine similarity: sim(ML,ML)={:.4} vs sim(ML,cookies)={:.4}",
            sim_ab,
            sim_ac
        );

        // The ML texts should be fairly similar
        assert!(sim_ab > 0.5, "Related texts should have cosine sim > 0.5, got {:.4}", sim_ab);
        // The unrelated text should be much less similar
        assert!(sim_ac < 0.5, "Unrelated texts should have cosine sim < 0.5, got {:.4}", sim_ac);
    }
}
