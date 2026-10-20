use hf_hub::api::sync::ApiBuilder;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// A model that loads lazily into a [`ModelSlot`], keyed by a settings id.
pub trait LoadableModel: Sized + Send + Sync + 'static {
    /// Names the model kind in logs and errors ("embedding", "reranker").
    const KIND: &'static str;

    fn load(cache_dir: PathBuf, id: &str) -> Result<Self, String>;

    /// Runs after a successful load. Only the embedding model has a listener.
    fn on_loaded(_app: &AppHandle, _notify: ModelLoadNotify) {}
}

pub(crate) struct ModelFiles {
    pub config: PathBuf,
    pub weights: PathBuf,
    pub tokenizer: PathBuf,
}

/// Fetches (or reuses from `cache_dir`) the three files a candle BERT-family
/// model loads from.
pub(crate) fn fetch_model_files(cache_dir: PathBuf, hf_repo: &str) -> Result<ModelFiles, String> {
    let api = ApiBuilder::new()
        .with_cache_dir(cache_dir)
        .with_progress(false)
        .build()
        .map_err(|e| format!("HF API init failed: {e}"))?;
    let repo = api.model(hf_repo.to_string());
    Ok(ModelFiles {
        config: repo
            .get("config.json")
            .map_err(|e| format!("config download: {e}"))?,
        weights: repo
            .get("model.safetensors")
            .map_err(|e| format!("weights download: {e}"))?,
        tokenizer: repo
            .get("tokenizer.json")
            .map_err(|e| format!("tokenizer download: {e}"))?,
    })
}

// After a load failure (offline machine, corrupt cache), skip retries for this
// long so every note save doesn't re-run HF network round-trips.
const LOAD_FAILURE_COOLDOWN: Duration = Duration::from_secs(60);

fn cooldown_error(kind: &str, id: &str) -> String {
    format!("{kind} model {id} failed to load recently; retry deferred")
}

/// Tracks which models have a background load in flight, so a second request
/// for the *same* model is dropped while a request for a *different* one still
/// starts. A bare flag would swallow a mid-flight model switch entirely.
///
/// Claims are released by [`InitClaim`]'s `Drop`, which also covers an unwind:
/// the release profile deliberately does not set `panic = "abort"` (the HNSW
/// `catch_unwind` needs unwind), so a panicking load thread would otherwise
/// leak its claim and make [`ModelSlot::init_in_background`] a permanent no-op
/// for that model — with no retry path anywhere.
#[derive(Clone, Default)]
pub(crate) struct InitQueue(Arc<Mutex<HashSet<String>>>);

impl InitQueue {
    /// Claims `model_id` unless a load for it is already running.
    pub(crate) fn claim(&self, model_id: &str) -> Option<InitClaim> {
        let mut in_flight = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        in_flight.insert(model_id.to_string()).then(|| InitClaim {
            queue: self.clone(),
            model_id: model_id.to_string(),
        })
    }

    #[cfg(test)]
    pub(crate) fn is_in_flight(&self, model_id: &str) -> bool {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .contains(model_id)
    }
}

pub(crate) struct InitClaim {
    queue: InitQueue,
    model_id: String,
}

impl Drop for InitClaim {
    fn drop(&mut self) {
        self.queue
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(&self.model_id);
    }
}

/// Whether a successful load emits `embedding_model_loaded`. The event exists
/// so a save that skipped embedding (model cold) gets a bulk pass once the
/// model is resident; a bulk pass loading the model for itself must stay
/// silent or it re-arms itself through the frontend reactor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelLoadNotify {
    Emit,
    Silent,
}

/// Lazily loaded, swappable model, managed as Tauri state.
pub struct ModelSlot<M> {
    inner: Mutex<Option<(String, Arc<M>)>>,
    // Serializes model loads so `inner` is never held across an HF download;
    // try_get stays non-blocking while a load is in flight.
    init_lock: Mutex<()>,
    last_failure: Mutex<Option<(String, Instant)>>,
    init_queue: InitQueue,
}

impl<M> Default for ModelSlot<M> {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
            init_lock: Mutex::new(()),
            last_failure: Mutex::new(None),
            init_queue: InitQueue::default(),
        }
    }
}

impl<M: LoadableModel> ModelSlot<M> {
    pub fn get_or_init(
        &self,
        cache_dir: PathBuf,
        id: &str,
        app_handle: &AppHandle,
        notify: ModelLoadNotify,
    ) -> Result<Arc<M>, String> {
        if let Some(model) = self.try_get(id) {
            return Ok(model);
        }
        if self.in_cooldown(id)? {
            return Err(cooldown_error(M::KIND, id));
        }

        let _init_guard = self.init_lock.lock().map_err(|e| e.to_string())?;
        if let Some(model) = self.try_get(id) {
            return Ok(model);
        }
        // Re-read the cooldown now that we hold the lock: the thread that just
        // released it may have been the failing load. Without this, N threads
        // that all passed the pre-lock check each run a full failing network
        // round-trip, serially.
        if self.in_cooldown(id)? {
            return Err(cooldown_error(M::KIND, id));
        }
        if let Ok(guard) = self.inner.lock() {
            if let Some((loaded_id, _)) = guard.as_ref() {
                log::info!(
                    "{} model changed: {loaded_id} -> {id}, reinitializing",
                    M::KIND
                );
            }
        }
        match M::load(cache_dir, id) {
            Ok(model) => {
                let arc = Arc::new(model);
                *self.inner.lock().map_err(|e| e.to_string())? =
                    Some((id.to_string(), Arc::clone(&arc)));
                *self.last_failure.lock().map_err(|e| e.to_string())? = None;
                M::on_loaded(app_handle, notify);
                Ok(arc)
            }
            Err(e) => {
                log::error!("Failed to load {} model {id}: {e}", M::KIND);
                *self.last_failure.lock().map_err(|e| e.to_string())? =
                    Some((id.to_string(), Instant::now()));
                Err(e)
            }
        }
    }

    fn in_cooldown(&self, id: &str) -> Result<bool, String> {
        let failure = self.last_failure.lock().map_err(|e| e.to_string())?;
        Ok(failure
            .as_ref()
            .is_some_and(|(failed_id, at)| failed_id == id && at.elapsed() < LOAD_FAILURE_COOLDOWN))
    }

    pub fn try_get(&self, id: &str) -> Option<Arc<M>> {
        self.inner.lock().ok().and_then(|g| {
            g.as_ref()
                .and_then(|(loaded, m)| (loaded == id).then(|| Arc::clone(m)))
        })
    }

    /// Kicks off a model load off the calling thread. Query and save paths use
    /// this so a cold cache never blocks on a synchronous HF download.
    pub fn init_in_background(&self, cache_dir: PathBuf, id: String, app_handle: &AppHandle) {
        let Some(claim) = self.init_queue.claim(&id) else {
            return;
        };
        let app = app_handle.clone();
        std::thread::spawn(move || {
            let _claim = claim;
            let slot = app.state::<ModelSlot<M>>();
            let _ = slot.get_or_init(cache_dir, &id, &app, ModelLoadNotify::Emit);
        });
    }
}
