use crate::features::search::embedding_model::{self, Pooling};
use crate::features::search::hnsw_index::is_usable_vector;
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config};
use hf_hub::api::sync::ApiBuilder;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokenizers::{PaddingParams, PaddingStrategy, Tokenizer, TruncationParams, TruncationStrategy};

/// Sequence budget the model is encoded at. Covers >95% of PKM sections;
/// shorter sequences yield [B,12,256,256] attention tensors, keeping Metal
/// buffer accumulation below 1 GB at batch_size=16. (ref: DL-001)
const MAX_SEQUENCE_TOKENS: usize = 256;
/// Room for the two special tokens the encoder adds around every input.
const MAX_CONTENT_TOKENS: usize = MAX_SEQUENCE_TOKENS - 2;

/// Below this the vector carries no direction and dividing by it would produce
/// inf/NaN, which one bad row propagates through an entire cosine graph.
const MIN_NORM: f32 = 1e-12;

/// Byte ceiling applied to whole-note text before it reaches the tokenizer.
/// `tokenizers` truncates in post-processing, so without this a 50 KB note is
/// WordPiece-tokenized in full just to keep [`MAX_CONTENT_TOKENS`] of it. The
/// budget leaves ~32 bytes of headroom per kept token: a token can be a single
/// CJK character (3 bytes), so a naive `budget * k` char slice could drop text
/// the tokenizer would have kept, and only a ceiling this far past any
/// plausible boundary is safe to cut blind.
const PRETRUNCATE_BYTES: usize = MAX_CONTENT_TOKENS * 32;

/// Bytes of text that typically fill one encoder chunk. Used only to size
/// batches, never to cut text.
const BYTES_PER_CHUNK: usize = MAX_CONTENT_TOKENS * 4;

pub struct EmbeddingService {
    model: BertModel,
    tokenizer: Tokenizer,
    // Untruncated twin of `tokenizer`, used only to find chunk boundaries in
    // over-long text.
    splitter: Tokenizer,
    device: Device,
    pooling: Pooling,
    query_prefix: Option<&'static str>,
    // Single-entry cache of the last query embedding. The search graph embeds
    // the same query twice in one pass (hybrid + semantic); this lets the
    // second call skip a redundant BERT forward pass. Scoped to queries so a
    // concurrent document batch cannot evict it between those two calls.
    last_query: Mutex<Option<(String, Vec<f32>)>>,
}

impl EmbeddingService {
    pub fn new(cache_dir: PathBuf, short_id: &str) -> Result<Self, String> {
        let spec = embedding_model::lookup(short_id);
        let model_id = spec.hf_repo;
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

        // f32 on every device. candle's BERT builds its additive attention mask
        // as `(1 - mask) * f32::MIN` cast to the model dtype
        // (candle-transformers bert.rs `get_extended_attention_mask`); in f16
        // `f32::MIN` saturates to -inf, so every *unmasked* position evaluates
        // `0 * -inf` = NaN and poisons the whole forward pass. There is no
        // f16-safe path through that function, so the dtype is not ours to
        // choose. (ref: DL-002)
        let model_dtype = DType::F32;

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

        let splitter =
            Tokenizer::from_file(&tokenizer_path).map_err(|e| format!("load tokenizer: {e}"))?;
        let mut tokenizer = splitter.clone();

        tokenizer
            .with_truncation(Some(TruncationParams {
                max_length: MAX_SEQUENCE_TOKENS,
                strategy: TruncationStrategy::LongestFirst,
                ..Default::default()
            }))
            .map_err(|e| format!("tokenizer truncation config: {e}"))?;
        tokenizer.with_padding(Some(PaddingParams {
            strategy: PaddingStrategy::BatchLongest,
            ..Default::default()
        }));

        let service = Self {
            model,
            tokenizer,
            splitter,
            device,
            pooling: spec.pooling,
            query_prefix: spec.query_prefix,
            last_query: Mutex::new(None),
        };
        service.check_encoder()?;
        Ok(service)
    }

    /// One forward pass at load. A dtype or kernel fault is uniform — it ruins
    /// one sentence exactly as thoroughly as it ruins a vault — so proving the
    /// encoder here turns what was a silent vault-wide corruption into a model
    /// that refuses to load and says so.
    fn check_encoder(&self) -> Result<(), String> {
        let probe = self.embed_documents(&["carbide encoder self-check"], None)?;
        match probe.first() {
            Some(vector) if is_usable_vector(vector) => Ok(()),
            _ => Err(format!(
                "encoder produced an unusable vector on {:?}",
                self.device
            )),
        }
    }

    /// Embeds a search query: applies the model's asymmetric query prefix and
    /// memoizes the result. Queries are short, so no chunking.
    pub fn embed_query(&self, text: &str) -> Result<Vec<f32>, String> {
        {
            let cache = self.last_query.lock().map_err(|e| e.to_string())?;
            if let Some((ref cached_text, ref cached_vec)) = *cache {
                if cached_text == text {
                    return Ok(cached_vec.clone());
                }
            }
        }
        let prefixed = match self.query_prefix {
            Some(prefix) => format!("{prefix}{text}"),
            None => text.to_string(),
        };
        let mut results = self.embed_batch(&[prefixed.as_str()], None, "query")?;
        let result = results
            .pop()
            .ok_or_else(|| "no embedding result".to_string())?;
        *self.last_query.lock().map_err(|e| e.to_string())? = Some((text.to_string(), result.clone()));
        Ok(result)
    }

    /// Embeds indexed content. Never prefixed, never memoized.
    pub fn embed_documents(
        &self,
        texts: &[&str],
        cancel: Option<&AtomicBool>,
    ) -> Result<Vec<Vec<f32>>, String> {
        self.embed_batch(texts, cancel, "documents")
    }

    /// Splits `text` at token boundaries so no piece exceeds the encoder's
    /// budget. Returns one piece for text that already fits, so callers can
    /// treat the single-chunk case as free.
    pub fn split_to_token_budget(&self, text: &str) -> Vec<String> {
        // A token never spans fewer than one byte, so text this short cannot
        // exceed the budget and does not need a second tokenization pass.
        if text.len() <= MAX_CONTENT_TOKENS {
            return vec![text.to_string()];
        }
        let Ok(encoding) = self.splitter.encode(text, false) else {
            return vec![text.to_string()];
        };
        let offsets = encoding.get_offsets();
        if offsets.len() <= MAX_CONTENT_TOKENS {
            return vec![text.to_string()];
        }
        chunk_by_offsets(text, offsets, MAX_CONTENT_TOKENS)
    }

    fn embed_batch(
        &self,
        texts: &[&str],
        cancel: Option<&AtomicBool>,
        caller: &'static str,
    ) -> Result<Vec<Vec<f32>>, String> {
        let pooled = self.encode_pooled(texts, cancel)?;
        if let Some(message) =
            unusable_rows_log_message(&self.device, self.pooling, caller, texts, &pooled)
        {
            log::warn!("{message}");
        }
        Ok(normalize_rows(pooled))
    }

    /// The forward pass and pooling, before normalization. Split out so the
    /// pooled rows can be inspected as the encoder produced them: once
    /// `normalize_rows` has zeroed a degenerate row, a non-finite forward pass
    /// and an all-zero one are indistinguishable.
    pub(crate) fn encode_pooled(
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

        // Pool on-device, then move only [B, D] across. The hidden state is
        // [B, S, D] — ~6.3 MB at B=32, S=256, D=384 — to produce 48 KB of
        // output, so the transfer, not the pooling arithmetic, is the cost.
        let pooled = pool_on_device(&hidden, &attention_mask, self.pooling)
            .map_err(|e| format!("pool: {e}"))?
            .to_device(&Device::Cpu)
            .map_err(|e| e.to_string())?
            .to_vec2::<f32>()
            .map_err(|e| e.to_string())?;

        if cancel.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err("embedding cancelled".to_string());
        }

        Ok(pooled)
    }
}

/// Caps whole-note text at [`PRETRUNCATE_BYTES`], cutting on a char boundary.
/// The encoder truncates this text to [`MAX_CONTENT_TOKENS`] anyway, so the only
/// content this can lose is text past a point the tokenizer would have discarded
/// — and only if the note averaged over 32 bytes per token up to that point,
/// which no natural language does.
pub(crate) fn pretruncate(text: &str) -> &str {
    if text.len() <= PRETRUNCATE_BYTES {
        return text;
    }
    let mut end = PRETRUNCATE_BYTES;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

/// How many encoder passes `text` will cost once [`EmbeddingService::split_to_token_budget`]
/// has cut it. Estimated from bytes rather than a second tokenizer pass, which
/// would cost more than the batching it sizes ever saves. Callers use it to keep
/// one flush from ballooning into many encoder passes, so an over- or
/// under-estimate costs responsiveness, never correctness.
pub(crate) fn estimated_chunk_count(text: &str) -> usize {
    text.len().div_ceil(BYTES_PER_CHUNK).max(1)
}

/// Whether an embedding error reports cancellation rather than a real failure.
/// Callers must stop their loop instead of logging it as a per-item failure.
pub(crate) fn is_cancellation(error: &str) -> bool {
    error.contains("cancelled")
}

/// Chars of input text a diagnostic log line carries — enough to recognize
/// the note or query, short enough to stay a single log line.
pub(crate) const EXCERPT_CHARS: usize = 80;

/// First [`EXCERPT_CHARS`] chars of `text` with control characters escaped,
/// so a log line can name the input that triggered it without newlines or
/// other control bytes breaking the line or hiding in it.
pub(crate) fn excerpt(text: &str) -> String {
    let mut out = String::new();
    for (i, c) in text.chars().enumerate() {
        if i == EXCERPT_CHARS {
            out.push('…');
            break;
        }
        match c {
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c.is_control() => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

/// Builds the warn for pooled rows the ingest guard will refuse, or `None`
/// when every row is usable. Names the caller and the first unusable input:
/// device/pooling/dims alone never identified what the encoder choked on, and
/// without the input the trigger is unobservable. `texts` must line up with
/// `pooled` one row per input, as every `embed_batch` call does.
pub(crate) fn unusable_rows_log_message(
    device: &Device,
    pooling: Pooling,
    caller: &str,
    texts: &[&str],
    pooled: &[Vec<f32>],
) -> Option<String> {
    let (index, sample) = pooled
        .iter()
        .enumerate()
        .find(|(_, row)| !is_usable_vector(row))?;
    let unusable = pooled.iter().filter(|row| !is_usable_vector(row)).count();
    let nan = sample.iter().filter(|x| x.is_nan()).count();
    let infinite = sample.iter().filter(|x| x.is_infinite()).count();
    let zero = sample.iter().filter(|x| **x == 0.0).count();
    Some(format!(
        "embed: {unusable}/{} pooled rows unusable — caller={caller} device={device:?} \
         pooling={pooling:?} dims={} input={} sample row: nan={nan} inf={infinite} zero={zero}",
        pooled.len(),
        sample.len(),
        excerpt(texts.get(index).copied().unwrap_or("")),
    ))
}

static UNUSABLE_QUERY_WARNED: AtomicBool = AtomicBool::new(false);

/// Filters a query embedding the encoder could not turn into a usable vector.
/// `normalize_rows` has already zeroed such a row, and a zero query is
/// cosine-equidistant from every point, so feeding it to the index would
/// return arbitrary neighbours ranked as confidently as real ones. `None`
/// means "skip the vector leg" — text search degrades honestly instead. The
/// encoder fault is input-specific and repeat queries are common, so the warn
/// fires once per session rather than per query.
pub(crate) fn usable_query_vector(vector: Vec<f32>, query_text: &str) -> Option<Vec<f32>> {
    if is_usable_vector(&vector) {
        return Some(vector);
    }
    if !UNUSABLE_QUERY_WARNED.swap(true, Ordering::Relaxed) {
        log::warn!("{}", unusable_query_log_message(query_text));
    }
    None
}

/// Builds the once-per-session warn for an unusable query embedding, naming
/// the query so the input that triggered the encoder fault is observable.
pub(crate) fn unusable_query_log_message(query_text: &str) -> String {
    format!(
        "embed: query vector unusable — skipping vector leg; query={}",
        excerpt(query_text)
    )
}

/// Embeds `texts` in one pass, retrying one at a time if the batch fails, so a
/// single unembeddable input costs only itself rather than its whole batch.
/// Entries that fail alone come back as `None`. `Err` means cancelled — the
/// caller must break, not retry.
pub(crate) fn embed_with_singles_fallback<F>(
    texts: &[&str],
    mut embed: F,
) -> Result<Vec<Option<Vec<f32>>>, String>
where
    F: FnMut(&[&str]) -> Result<Vec<Vec<f32>>, String>,
{
    match embed(texts) {
        Ok(vectors) if vectors.len() == texts.len() => {
            return Ok(vectors.into_iter().map(Some).collect())
        }
        Ok(vectors) => log::warn!(
            "embed: batch returned {} vectors for {} texts; retrying one at a time",
            vectors.len(),
            texts.len()
        ),
        Err(e) if is_cancellation(&e) => return Err(e),
        Err(e) => log::warn!(
            "embed: batch of {} failed ({e}); retrying one at a time",
            texts.len()
        ),
    }

    let mut vectors = Vec::with_capacity(texts.len());
    for text in texts {
        match embed(std::slice::from_ref(text)) {
            Ok(mut single) => vectors.push(single.pop()),
            Err(e) if is_cancellation(&e) => return Err(e),
            Err(e) => {
                log::warn!("embed: single text failed: {e}");
                vectors.push(None);
            }
        }
    }
    Ok(vectors)
}

/// Cuts `text` into pieces of at most `budget` tokens, using each token's byte
/// span. Offsets are snapped outward to char boundaries: a normalizer can map a
/// token onto the interior of a multi-byte codepoint, and slicing there would
/// drop the whole chunk. Falls back to the whole text rather than returning
/// nothing, so no content is ever silently lost.
pub(crate) fn chunk_by_offsets(
    text: &str,
    offsets: &[(usize, usize)],
    budget: usize,
) -> Vec<String> {
    let floor = |mut i: usize| {
        i = i.min(text.len());
        while i > 0 && !text.is_char_boundary(i) {
            i -= 1;
        }
        i
    };
    let ceil = |mut i: usize| {
        i = i.min(text.len());
        while i < text.len() && !text.is_char_boundary(i) {
            i += 1;
        }
        i
    };

    let chunks: Vec<String> = offsets
        .chunks(budget)
        .filter_map(|window| {
            let start = floor(window.first()?.0);
            let end = ceil(window.last()?.1);
            (end > start).then(|| text[start..end].to_string())
        })
        .filter(|piece| !piece.trim().is_empty())
        .collect();

    if chunks.is_empty() {
        vec![text.to_string()]
    } else {
        chunks
    }
}

/// Reduces `[B, S, D]` token states to `[B, D]` without leaving the device.
/// Both branches settle on f32 so the contract holds for any dtype the model
/// is loaded at, not just the f32 it currently uses.
pub(crate) fn pool_on_device(
    hidden: &Tensor,
    mask: &Tensor,
    strategy: Pooling,
) -> Result<Tensor, candle_core::Error> {
    match strategy {
        Pooling::Cls => hidden.narrow(1, 0, 1)?.squeeze(1)?.to_dtype(DType::F32),
        Pooling::Mean => {
            let hidden = hidden.to_dtype(DType::F32)?;
            let mask = mask.to_dtype(DType::F32)?;
            let counts = mask.sum(1)?.clamp(1.0f32, f32::INFINITY)?;
            hidden
                .broadcast_mul(&mask.unsqueeze(2)?)?
                .sum(1)?
                .broadcast_div(&counts.unsqueeze(1)?)
        }
    }
}

/// L2-normalizes each row in place. A row whose norm is zero or non-finite is
/// zeroed rather than divided: one NaN in a cosine graph degrades neighbour
/// selection for every query, not just its own.
pub(crate) fn normalize_rows(mut rows: Vec<Vec<f32>>) -> Vec<Vec<f32>> {
    for row in rows.iter_mut() {
        let norm = row.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm.is_finite() && norm > MIN_NORM {
            row.iter_mut().for_each(|x| *x /= norm);
        } else {
            row.iter_mut().for_each(|x| *x = 0.0);
        }
    }
    rows
}

/// CPU reference for the pooling contract, on plain slices so it is testable
/// with no model and no GPU. `pool_on_device` must agree with it exactly; the
/// pooling tests assert that equivalence.
#[cfg(test)]
pub(crate) fn pool_and_normalize(
    hidden: &[Vec<Vec<f32>>],
    mask: &[Vec<u32>],
    strategy: Pooling,
) -> Vec<Vec<f32>> {
    let pooled: Vec<Vec<f32>> = hidden
        .iter()
        .zip(mask.iter())
        .map(|(sequence, sequence_mask)| match strategy {
            Pooling::Cls => sequence.first().cloned().unwrap_or_default(),
            Pooling::Mean => {
                let dims = sequence.first().map(Vec::len).unwrap_or(0);
                let mut sum = vec![0.0f32; dims];
                let mut count = 0.0f32;
                for (token, keep) in sequence.iter().zip(sequence_mask.iter()) {
                    if *keep == 0 {
                        continue;
                    }
                    count += 1.0;
                    for (acc, x) in sum.iter_mut().zip(token.iter()) {
                        *acc += x;
                    }
                }
                let divisor = count.max(1.0);
                sum.iter_mut().for_each(|x| *x /= divisor);
                sum
            }
        })
        .collect();

    normalize_rows(pooled)
}

// After a load failure (offline machine, corrupt cache), skip retries for this
// long so every note save doesn't re-run HF network round-trips.
const LOAD_FAILURE_COOLDOWN: Duration = Duration::from_secs(60);

fn cooldown_error(short_id: &str) -> String {
    format!("embedding model {short_id} failed to load recently; retry deferred")
}

/// Tracks which models have a background load in flight, so a second request
/// for the *same* model is dropped while a request for a *different* one still
/// starts. A bare flag would swallow a mid-flight model switch entirely.
///
/// Claims are released by [`InitClaim`]'s `Drop`, which also covers an unwind:
/// the release profile deliberately does not set `panic = "abort"` (the HNSW
/// `catch_unwind` needs unwind), so a panicking load thread would otherwise
/// leak its claim and make [`EmbeddingServiceState::init_in_background`] a
/// permanent no-op for that model — with no retry path anywhere.
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

#[derive(Default)]
pub struct EmbeddingServiceState {
    inner: Mutex<Option<(String, Arc<EmbeddingService>)>>,
    // Serializes model loads so `inner` is never held across an HF download;
    // try_get stays non-blocking while a load is in flight.
    init_lock: Mutex<()>,
    last_failure: Mutex<Option<(String, Instant)>>,
    init_queue: InitQueue,
}

impl EmbeddingServiceState {
    pub fn get_or_init(
        &self,
        cache_dir: PathBuf,
        short_id: &str,
        app_handle: &AppHandle,
    ) -> Result<Arc<EmbeddingService>, String> {
        if let Some(service) = self.try_get(short_id) {
            return Ok(service);
        }
        if self.in_cooldown(short_id)? {
            return Err(cooldown_error(short_id));
        }

        let _init_guard = self.init_lock.lock().map_err(|e| e.to_string())?;
        if let Some(service) = self.try_get(short_id) {
            return Ok(service);
        }
        // Re-read the cooldown now that we hold the lock: the thread that just
        // released it may have been the failing load. Without this, N threads
        // that all passed the pre-lock check each run a full failing network
        // round-trip, serially.
        if self.in_cooldown(short_id)? {
            return Err(cooldown_error(short_id));
        }
        if let Ok(guard) = self.inner.lock() {
            if let Some((loaded_id, _)) = guard.as_ref() {
                log::info!("Embedding model changed: {loaded_id} -> {short_id}, reinitializing");
            }
        }
        match EmbeddingService::new(cache_dir, short_id) {
            Ok(service) => {
                let arc = Arc::new(service);
                *self.inner.lock().map_err(|e| e.to_string())? =
                    Some((short_id.to_string(), Arc::clone(&arc)));
                *self.last_failure.lock().map_err(|e| e.to_string())? = None;
                let _ = app_handle.emit("embedding_model_loaded", ());
                Ok(arc)
            }
            Err(e) => {
                log::error!("Failed to load embedding model {short_id}: {e}");
                *self.last_failure.lock().map_err(|e| e.to_string())? =
                    Some((short_id.to_string(), Instant::now()));
                Err(e)
            }
        }
    }

    fn in_cooldown(&self, short_id: &str) -> Result<bool, String> {
        let failure = self.last_failure.lock().map_err(|e| e.to_string())?;
        Ok(failure.as_ref().is_some_and(|(failed_id, at)| {
            failed_id == short_id && at.elapsed() < LOAD_FAILURE_COOLDOWN
        }))
    }

    pub fn try_get(&self, short_id: &str) -> Option<Arc<EmbeddingService>> {
        self.inner.lock().ok().and_then(|g| {
            g.as_ref()
                .and_then(|(id, s)| (id == short_id).then(|| Arc::clone(s)))
        })
    }

    /// Kicks off a model load off the calling thread. Query and save paths use
    /// this so a cold cache never blocks on a synchronous HF download.
    pub fn init_in_background(&self, cache_dir: PathBuf, short_id: String, app_handle: &AppHandle) {
        let Some(claim) = self.init_queue.claim(&short_id) else {
            return;
        };
        let app = app_handle.clone();
        std::thread::spawn(move || {
            let _claim = claim;
            let state = app.state::<EmbeddingServiceState>();
            let _ = state.get_or_init(cache_dir, &short_id, &app);
        });
    }
}
