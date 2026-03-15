use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct EmbeddingService {
    model: TextEmbedding,
}

impl EmbeddingService {
    pub fn new(cache_dir: PathBuf) -> Result<Self, String> {
        let options = InitOptions::new(EmbeddingModel::BGESmallENV15)
            .with_cache_dir(cache_dir)
            .with_show_download_progress(false);
        let model = TextEmbedding::try_new(options).map_err(|e| e.to_string())?;
        Ok(Self { model })
    }

    pub fn embed_one(&self, text: &str) -> Result<Vec<f32>, String> {
        let mut results = self
            .model
            .embed(vec![text], None)
            .map_err(|e| e.to_string())?;
        results
            .pop()
            .ok_or_else(|| "embedding returned no results".to_string())
    }

    pub fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, String> {
        self.model
            .embed(texts.to_vec(), Some(50))
            .map_err(|e| e.to_string())
    }
}

#[derive(Default)]
pub struct EmbeddingServiceState {
    inner: Mutex<Option<Arc<EmbeddingService>>>,
}

impl EmbeddingServiceState {
    pub fn get_or_init(&self, cache_dir: PathBuf) -> Result<Arc<EmbeddingService>, String> {
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
        Ok(arc)
    }

    pub fn get(&self) -> Option<Arc<EmbeddingService>> {
        self.inner
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(Arc::clone))
    }
}
