use crate::features::search::model_slot::{fetch_model_files, LoadableModel, ModelSlot};
use crate::features::search::rerank::PassageScorer;
use candle_core::{DType, Device, Tensor, D};
use candle_nn::{linear, Linear, Module, VarBuilder};
use candle_transformers::models::bert::{BertModel, Config};
use std::path::PathBuf;
use tokenizers::{PaddingParams, Tokenizer, TruncationParams, TruncationStrategy};

pub const RERANKER_ID: &str = "ms-marco-MiniLM-L6-v2";
const RERANKER_REPO: &str = "cross-encoder/ms-marco-MiniLM-L6-v2";

/// Query + passage token budget (ref: DL-007). Matches the section windows the
/// block vectors are embedded at, so the matched window reaches the scorer
/// whole: at 128 the answer in a long section is often cut off, which cost
/// 0.26 MRR on the long-section eval queries.
const MAX_PAIR_TOKENS: usize = 256;

pub type RerankerState = ModelSlot<CrossEncoder>;

/// `BertForSequenceClassification` with one logit: BERT, then the pooler
/// (dense + tanh over [CLS]), then a linear head. candle's `BertModel` stops
/// before the pooler, so both heads are loaded here.
///
/// Runs on the CPU (ref: DL-007): on Metal it would have to share the
/// embedding encoder's forward lock, queueing every search behind background
/// embed batches, for a ~1.3x speedup at this size.
pub struct CrossEncoder {
    model: BertModel,
    pooler: Linear,
    classifier: Linear,
    tokenizer: Tokenizer,
}

impl CrossEncoder {
    pub fn new(cache_dir: PathBuf) -> Result<Self, String> {
        let files = fetch_model_files(cache_dir, RERANKER_REPO)?;
        let config: Config = serde_json::from_str(
            &std::fs::read_to_string(&files.config).map_err(|e| format!("read config: {e}"))?,
        )
        .map_err(|e| format!("parse config: {e}"))?;
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[files.weights], DType::F32, &Device::Cpu)
                .map_err(|e| format!("load weights: {e}"))?
        };
        let model = BertModel::load(vb.clone(), &config).map_err(|e| format!("load model: {e}"))?;
        let pooler = linear(
            config.hidden_size,
            config.hidden_size,
            vb.pp("bert.pooler.dense"),
        )
        .map_err(|e| format!("load pooler: {e}"))?;
        let classifier = linear(config.hidden_size, 1, vb.pp("classifier"))
            .map_err(|e| format!("load classifier: {e}"))?;

        let mut tokenizer =
            Tokenizer::from_file(&files.tokenizer).map_err(|e| format!("load tokenizer: {e}"))?;
        tokenizer
            .with_truncation(Some(TruncationParams {
                max_length: MAX_PAIR_TOKENS,
                strategy: TruncationStrategy::LongestFirst,
                ..Default::default()
            }))
            .map_err(|e| format!("tokenizer truncation config: {e}"))?;
        tokenizer.with_padding(Some(PaddingParams::default()));

        let encoder = Self {
            model,
            pooler,
            classifier,
            tokenizer,
        };
        encoder.check_scorer()?;
        Ok(encoder)
    }

    /// One scored pair at load, so a weight or head mismatch refuses to load
    /// instead of silently reordering every search.
    fn check_scorer(&self) -> Result<(), String> {
        let probe = self.score(
            "carbide reranker self-check",
            &["carbide reranker self-check passage"],
        )?;
        match probe.as_slice() {
            [score] if score.is_finite() => Ok(()),
            _ => Err(format!("reranker produced an unusable score: {probe:?}")),
        }
    }

    fn logits(&self, query: &str, passages: &[&str]) -> candle_core::Result<Vec<f32>> {
        let pairs: Vec<(&str, &str)> = passages.iter().map(|p| (query, *p)).collect();
        let encodings = self
            .tokenizer
            .encode_batch(pairs, true)
            .map_err(candle_core::Error::wrap)?;
        let column = |f: fn(&tokenizers::Encoding) -> &[u32]| {
            let rows: Vec<Vec<u32>> = encodings.iter().map(|e| f(e).to_vec()).collect();
            Tensor::new(rows, &Device::Cpu)
        };
        let ids = column(tokenizers::Encoding::get_ids)?;
        let type_ids = column(tokenizers::Encoding::get_type_ids)?;
        let mask = column(tokenizers::Encoding::get_attention_mask)?;

        let hidden = self.model.forward(&ids, &type_ids, Some(&mask))?;
        let cls = hidden.narrow(1, 0, 1)?.squeeze(1)?.contiguous()?;
        let pooled = self.pooler.forward(&cls)?.tanh()?;
        self.classifier
            .forward(&pooled)?
            .squeeze(D::Minus1)?
            .to_vec1::<f32>()
    }
}

impl PassageScorer for CrossEncoder {
    fn score(&self, query: &str, passages: &[&str]) -> Result<Vec<f32>, String> {
        if passages.is_empty() {
            return Ok(Vec::new());
        }
        self.logits(query, passages)
            .map_err(|e| format!("rerank forward: {e}"))
    }
}

impl LoadableModel for CrossEncoder {
    const KIND: &'static str = "reranker";

    fn load(cache_dir: PathBuf, _id: &str) -> Result<Self, String> {
        CrossEncoder::new(cache_dir)
    }
}
