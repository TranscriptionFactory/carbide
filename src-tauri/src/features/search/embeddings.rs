use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config};
use hf_hub::api::sync::ApiBuilder;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokenizers::{PaddingParams, PaddingStrategy, Tokenizer, TruncationParams, TruncationStrategy};

pub struct EmbeddingService {
    model: BertModel,
    tokenizer: Tokenizer,
    device: Device,
    // Single-entry cache of the last single-text embedding. The search graph
    // embeds the same query twice in one pass (hybrid + semantic); this lets
    // the second call skip a redundant BERT forward pass.
    last_embed: Mutex<Option<(String, Vec<f32>)>>,
}

impl EmbeddingService {
    pub fn new(cache_dir: PathBuf, model_id: &str) -> Result<Self, String> {
        let device = {
            #[cfg(target_os = "macos")]
            {
                match Device::new_metal(0) {
                    Ok(d) => {
                        log::info!("Embedding device: Metal GPU");
                        d
                    }
                    Err(e) => {
                        log::warn!("Metal GPU unavailable, falling back to CPU: {e}");
                        Device::Cpu
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                Device::Cpu
            }
        };

        // f16 on Metal halves attention-tensor memory and ~2x the GPU matmul
        // throughput on M2 (M4 hides the f32 cost). CPU keeps f32 because
        // Accelerate's BLAS is f32-tuned and its f16 path is slower.
        let model_dtype = match device {
            Device::Metal(_) => DType::F16,
            _ => DType::F32,
        };

        let api = ApiBuilder::new()
            .with_cache_dir(cache_dir)
            .with_progress(false)
            .build()
            .map_err(|e| format!("HF API init failed: {e}"))?;
        let repo = api.model(model_id.to_string());

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
            VarBuilder::from_mmaped_safetensors(&[weights_path], model_dtype, &device)
                .map_err(|e| format!("load weights: {e}"))?
        };

        let model = BertModel::load(vb, &config).map_err(|e| format!("load model: {e}"))?;

        let mut tokenizer =
            Tokenizer::from_file(&tokenizer_path).map_err(|e| format!("load tokenizer: {e}"))?;

        tokenizer
            .with_truncation(Some(TruncationParams {
                // 256 tokens covers >95% of PKM sections; shorter sequences yield
                // [B,12,256,256] attention tensors, keeping Metal buffer
                // accumulation below 1 GB at batch_size=16. (ref: DL-001)
                max_length: 256,
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
            last_embed: Mutex::new(None),
        })
    }

    pub fn embed_one(&self, text: &str) -> Result<Vec<f32>, String> {
        {
            let cache = self.last_embed.lock().map_err(|e| e.to_string())?;
            if let Some((ref cached_text, ref cached_vec)) = *cache {
                if cached_text == text {
                    return Ok(cached_vec.clone());
                }
            }
        }
        let mut results = self.embed_batch(&[text], None)?;
        let result = results
            .pop()
            .ok_or_else(|| "no embedding result".to_string())?;
        *self.last_embed.lock().map_err(|e| e.to_string())? = Some((text.to_string(), result.clone()));
        Ok(result)
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

        // Pool + L2 norm on CPU. These six tiny ops on [B, S, D] tensors don't
        // amortize Metal kernel-launch overhead at any realistic batch size,
        // and we want the final output back on CPU regardless. Casting hidden
        // from f16->f32 here also keeps the norm/division numerically stable.
        let hidden = hidden
            .to_device(&Device::Cpu)
            .map_err(|e| e.to_string())?
            .to_dtype(DType::F32)
            .map_err(|e| e.to_string())?;
        let mask_f = attention_mask
            .to_device(&Device::Cpu)
            .map_err(|e| e.to_string())?
            .to_dtype(DType::F32)
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

// After a load failure (offline machine, corrupt cache), skip retries for this
// long so every note save doesn't re-run HF network round-trips.
const LOAD_FAILURE_COOLDOWN: Duration = Duration::from_secs(60);

pub struct EmbeddingServiceState {
    inner: Mutex<Option<(String, Arc<EmbeddingService>)>>,
    // Serializes model loads so `inner` is never held across an HF download;
    // try_get stays non-blocking while a load is in flight.
    init_lock: Mutex<()>,
    last_failure: Mutex<Option<(String, Instant)>>,
    init_queued: AtomicBool,
}

impl Default for EmbeddingServiceState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
            init_lock: Mutex::new(()),
            last_failure: Mutex::new(None),
            init_queued: AtomicBool::new(false),
        }
    }
}

impl EmbeddingServiceState {
    pub fn get_or_init(
        &self,
        cache_dir: PathBuf,
        model_id: &str,
        app_handle: &AppHandle,
    ) -> Result<Arc<EmbeddingService>, String> {
        if let Some(service) = self.try_get(model_id) {
            return Ok(service);
        }
        {
            let failure = self.last_failure.lock().map_err(|e| e.to_string())?;
            if let Some((failed_id, at)) = failure.as_ref() {
                if failed_id == model_id && at.elapsed() < LOAD_FAILURE_COOLDOWN {
                    return Err(format!(
                        "embedding model {model_id} failed to load recently; retry deferred"
                    ));
                }
            }
        }

        let _init_guard = self.init_lock.lock().map_err(|e| e.to_string())?;
        if let Some(service) = self.try_get(model_id) {
            return Ok(service);
        }
        if let Ok(guard) = self.inner.lock() {
            if let Some((loaded_id, _)) = guard.as_ref() {
                log::info!("Embedding model changed: {loaded_id} -> {model_id}, reinitializing");
            }
        }
        match EmbeddingService::new(cache_dir, model_id) {
            Ok(service) => {
                let arc = Arc::new(service);
                *self.inner.lock().map_err(|e| e.to_string())? =
                    Some((model_id.to_string(), Arc::clone(&arc)));
                *self.last_failure.lock().map_err(|e| e.to_string())? = None;
                let _ = app_handle.emit("embedding_model_loaded", ());
                Ok(arc)
            }
            Err(e) => {
                log::error!("Failed to load embedding model {model_id}: {e}");
                *self.last_failure.lock().map_err(|e| e.to_string())? =
                    Some((model_id.to_string(), Instant::now()));
                Err(e)
            }
        }
    }

    pub fn try_get(&self, model_id: &str) -> Option<Arc<EmbeddingService>> {
        self.inner.lock().ok().and_then(|g| {
            g.as_ref()
                .and_then(|(id, s)| (id == model_id).then(|| Arc::clone(s)))
        })
    }

    /// Kicks off a model load off the calling thread. Query paths use this so a
    /// cold cache never blocks a search on a synchronous HF download.
    pub fn init_in_background(&self, cache_dir: PathBuf, model_id: String, app_handle: &AppHandle) {
        if self.init_queued.swap(true, Ordering::SeqCst) {
            return;
        }
        let app = app_handle.clone();
        std::thread::spawn(move || {
            let state = app.state::<EmbeddingServiceState>();
            let _ = state.get_or_init(cache_dir, &model_id, &app);
            state.init_queued.store(false, Ordering::SeqCst);
        });
    }
}
