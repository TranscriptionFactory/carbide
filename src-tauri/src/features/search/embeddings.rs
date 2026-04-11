use candle_core::{Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config, DTYPE};
use hf_hub::api::sync::ApiBuilder;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokenizers::{PaddingParams, PaddingStrategy, Tokenizer, TruncationParams, TruncationStrategy};

const MODEL_ID: &str = "Snowflake/snowflake-arctic-embed-xs";

pub struct EmbeddingService {
    model: BertModel,
    tokenizer: Tokenizer,
    device: Device,
}

impl EmbeddingService {
    pub fn new(cache_dir: PathBuf) -> Result<Self, String> {
        let device = {
            #[cfg(target_os = "macos")]
            {
                Device::new_metal(0).unwrap_or_else(|e| {
                    log::warn!("Metal GPU unavailable, falling back to CPU: {e}");
                    Device::Cpu
                })
            }
            #[cfg(not(target_os = "macos"))]
            {
                Device::Cpu
            }
        };

        let api = ApiBuilder::new()
            .with_cache_dir(cache_dir)
            .with_progress(false)
            .build()
            .map_err(|e| format!("HF API init failed: {e}"))?;
        let repo = api.model(MODEL_ID.to_string());

        let config_path = repo
            .get("config.json")
            .map_err(|e| format!("config download: {e}"))?;
        let weights_path = repo
            .get("model.safetensors")
            .map_err(|e| format!("weights download: {e}"))?;
        let tokenizer_path = repo
            .get("tokenizer.json")
            .map_err(|e| format!("tokenizer download: {e}"))?;

        let config: Config = serde_json::from_str(
            &std::fs::read_to_string(&config_path).map_err(|e| format!("read config: {e}"))?,
        )
        .map_err(|e| format!("parse config: {e}"))?;

        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[weights_path], DTYPE, &device)
                .map_err(|e| format!("load weights: {e}"))?
        };

        let model = BertModel::load(vb, &config).map_err(|e| format!("load model: {e}"))?;

        let mut tokenizer =
            Tokenizer::from_file(&tokenizer_path).map_err(|e| format!("load tokenizer: {e}"))?;

        tokenizer
            .with_truncation(Some(TruncationParams {
                // 512 max_position_embeddings minus 2 special tokens ([CLS] + [SEP])
                max_length: 510,
                strategy: TruncationStrategy::LongestFirst,
                ..Default::default()
            }))
            .map_err(|e| format!("tokenizer truncation config: {e}"))?;
        tokenizer.with_padding(Some(PaddingParams {
            strategy: PaddingStrategy::BatchLongest,
            ..Default::default()
        }));

        Ok(Self {
            model,
            tokenizer,
            device,
        })
    }

    pub fn embed_one(&self, text: &str) -> Result<Vec<f32>, String> {
        let mut results = self.embed_batch(&[text], None)?;
        results
            .pop()
            .ok_or_else(|| "no embedding result".to_string())
    }

    pub fn embed_batch(
        &self,
        texts: &[&str],
        cancel: Option<&AtomicBool>,
    ) -> Result<Vec<Vec<f32>>, String> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        let encodings = self
            .tokenizer
            .encode_batch(texts.to_vec(), true)
            .map_err(|e| format!("tokenize: {e}"))?;

        if cancel.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err("embedding cancelled".to_string());
        }

        let token_ids: Vec<Vec<u32>> = encodings.iter().map(|e| e.get_ids().to_vec()).collect();
        let attention_masks: Vec<Vec<u32>> = encodings
            .iter()
            .map(|e| e.get_attention_mask().to_vec())
            .collect();
        let type_ids: Vec<Vec<u32>> = encodings
            .iter()
            .map(|e| e.get_type_ids().to_vec())
            .collect();

        let batch_size = texts.len();

        let token_ids = Tensor::new(token_ids, &self.device).map_err(|e| e.to_string())?;
        let attention_mask =
            Tensor::new(attention_masks, &self.device).map_err(|e| e.to_string())?;
        let type_ids = Tensor::new(type_ids, &self.device).map_err(|e| e.to_string())?;

        let hidden = self
            .model
            .forward(&token_ids, &type_ids, Some(&attention_mask))
            .map_err(|e| format!("forward: {e}"))?;

        if cancel.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err("embedding cancelled".to_string());
        }

        // Mean pooling: mask-weighted average over sequence dimension
        let mask_f = attention_mask
            .to_dtype(DTYPE)
            .map_err(|e| e.to_string())?
            .unsqueeze(2)
            .map_err(|e| e.to_string())?;

        let sum_mask = mask_f.sum(1).map_err(|e| e.to_string())?;
        let pooled = hidden
            .broadcast_mul(&mask_f)
            .map_err(|e| e.to_string())?
            .sum(1)
            .map_err(|e| e.to_string())?
            .broadcast_div(&sum_mask)
            .map_err(|e| e.to_string())?;

        // L2 normalize
        let norm = pooled
            .sqr()
            .map_err(|e| e.to_string())?
            .sum_keepdim(1)
            .map_err(|e| e.to_string())?
            .sqrt()
            .map_err(|e| e.to_string())?;
        let normalized = pooled.broadcast_div(&norm).map_err(|e| e.to_string())?;

        if cancel.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err("embedding cancelled".to_string());
        }

        let vecs: Vec<Vec<f32>> = (0..batch_size)
            .map(|i| {
                normalized
                    .get(i)
                    .map_err(|e| e.to_string())?
                    .to_vec1::<f32>()
                    .map_err(|e| e.to_string())
            })
            .collect::<Result<_, _>>()?;

        Ok(vecs)
    }
}

pub struct EmbeddingServiceState {
    inner: Mutex<Option<Arc<EmbeddingService>>>,
    initialized: AtomicBool,
}

impl Default for EmbeddingServiceState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
            initialized: AtomicBool::new(false),
        }
    }
}

impl EmbeddingServiceState {
    pub fn get_or_init(
        &self,
        cache_dir: PathBuf,
        app_handle: &AppHandle,
    ) -> Result<Arc<EmbeddingService>, String> {
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        if let Some(ref service) = *guard {
            return Ok(Arc::clone(service));
        }
        let service = EmbeddingService::new(cache_dir).map_err(|e| {
            log::error!("Failed to load embedding model: {e}");
            e
        })?;
        let arc = Arc::new(service);
        *guard = Some(Arc::clone(&arc));
        if !self.initialized.swap(true, Ordering::SeqCst) {
            let _ = app_handle.emit("embedding_model_loaded", ());
        }
        Ok(arc)
    }

    pub fn _get(&self) -> Option<Arc<EmbeddingService>> {
        self.inner
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(Arc::clone))
    }
}
