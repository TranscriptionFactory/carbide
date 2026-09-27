use candle_core::{DType, Device, Tensor};
use candle_nn::{linear, Linear, Module, VarBuilder};
use candle_transformers::models::bert::{BertModel, Config as BertConfig};
use candle_transformers::models::xlm_roberta::{
    Config as XlmRobertaConfig, XLMRobertaForSequenceClassification,
};
use hf_hub::api::sync::ApiBuilder;
use std::path::PathBuf;
use tokenizers::{
    EncodeInput, Encoding, PaddingParams, PaddingStrategy, Tokenizer, TruncationParams,
    TruncationStrategy,
};

pub const DEFAULT_MAX_TOKENS: usize = 512;

// Generous enough that the tokenizer, not this cut, decides what is kept
// (see `embeddings::PRETRUNCATE_BYTES`); it only spares WordPiece a 50 KB note.
const PRETRUNCATE_BYTES_PER_TOKEN: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RerankerModel {
    MsMarcoMiniLmL6,
    BgeRerankerBase,
}

impl RerankerModel {
    pub fn hf_repo(self) -> &'static str {
        match self {
            Self::MsMarcoMiniLmL6 => "cross-encoder/ms-marco-MiniLM-L-6-v2",
            Self::BgeRerankerBase => "BAAI/bge-reranker-base",
        }
    }
}

enum CrossEncoder {
    Bert {
        encoder: BertModel,
        pooler: Linear,
        classifier: Linear,
    },
    XlmRoberta(XLMRobertaForSequenceClassification),
}

impl CrossEncoder {
    fn logits(&self, ids: &Tensor, type_ids: &Tensor, mask: &Tensor) -> candle_core::Result<Tensor> {
        match self {
            Self::Bert {
                encoder,
                pooler,
                classifier,
            } => {
                let hidden = encoder.forward(ids, type_ids, Some(mask))?;
                let cls = hidden.get_on_dim(1, 0)?.contiguous()?;
                let pooled = pooler.forward(&cls)?.tanh()?;
                classifier.forward(&pooled)
            }
            Self::XlmRoberta(model) => model.forward(ids, mask, type_ids),
        }
    }

    fn uses_type_ids(&self) -> bool {
        matches!(self, Self::Bert { .. })
    }
}

pub struct Reranker {
    model: CrossEncoder,
    tokenizer: Tokenizer,
    device: Device,
    max_tokens: usize,
}

impl Reranker {
    pub fn new(cache_dir: PathBuf, which: RerankerModel) -> Result<Self, String> {
        let device = Device::Cpu;
        let api = ApiBuilder::new()
            .with_cache_dir(cache_dir)
            .with_progress(false)
            .build()
            .map_err(|e| format!("HF API init failed: {e}"))?;
        let repo = api.model(which.hf_repo().to_string());
        let fetch = |name: &str| repo.get(name).map_err(|e| format!("{name} download: {e}"));
        let config_path = fetch("config.json")?;
        let weights_path = fetch("model.safetensors")?;
        let tokenizer_path = fetch("tokenizer.json")?;

        let config_json =
            std::fs::read_to_string(&config_path).map_err(|e| format!("read config: {e}"))?;
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[weights_path], DType::F32, &device)
                .map_err(|e| format!("load weights: {e}"))?
        };
        let (model, pad_id) = match which {
            RerankerModel::MsMarcoMiniLmL6 => load_bert(&config_json, vb)?,
            RerankerModel::BgeRerankerBase => load_xlm_roberta(&config_json, vb)?,
        };

        let mut tokenizer =
            Tokenizer::from_file(&tokenizer_path).map_err(|e| format!("load tokenizer: {e}"))?;
        let pad_token = tokenizer
            .id_to_token(pad_id)
            .ok_or_else(|| format!("tokenizer has no pad token for id {pad_id}"))?;
        tokenizer.with_padding(Some(PaddingParams {
            strategy: PaddingStrategy::BatchLongest,
            pad_id,
            pad_token,
            ..Default::default()
        }));

        let mut reranker = Self {
            model,
            tokenizer,
            device,
            max_tokens: 0,
        };
        reranker.set_max_tokens(DEFAULT_MAX_TOKENS)?;
        Ok(reranker)
    }

    pub fn set_max_tokens(&mut self, max_tokens: usize) -> Result<(), String> {
        self.tokenizer
            .with_truncation(Some(TruncationParams {
                max_length: max_tokens,
                strategy: TruncationStrategy::LongestFirst,
                ..Default::default()
            }))
            .map_err(|e| format!("tokenizer truncation config: {e}"))?;
        self.max_tokens = max_tokens;
        Ok(())
    }

    /// Raw relevance logits, one per passage, in input order. Higher is more
    /// relevant; the scale is model-specific, so only the order is comparable
    /// across models.
    pub fn score(&self, query: &str, passages: &[&str]) -> Result<Vec<f32>, String> {
        if passages.is_empty() {
            return Ok(Vec::new());
        }
        let byte_cap = self.max_tokens * PRETRUNCATE_BYTES_PER_TOKEN;
        let inputs: Vec<EncodeInput> = passages
            .iter()
            .map(|p| (query, &p[..p.floor_char_boundary(byte_cap)]).into())
            .collect();
        let encodings = self
            .tokenizer
            .encode_batch(inputs, true)
            .map_err(|e| format!("tokenize: {e}"))?;

        let ids = self.stack(&encodings, |e| e.get_ids())?;
        let mask = self.stack(&encodings, |e| e.get_attention_mask())?;
        let type_ids = if self.model.uses_type_ids() {
            self.stack(&encodings, |e| e.get_type_ids())?
        } else {
            ids.zeros_like().map_err(|e| e.to_string())?
        };

        self.model
            .logits(&ids, &type_ids, &mask)
            .and_then(|logits| logits.flatten_all()?.to_vec1::<f32>())
            .map_err(|e| format!("rerank forward: {e}"))
    }

    fn stack(&self, encodings: &[Encoding], field: fn(&Encoding) -> &[u32]) -> Result<Tensor, String> {
        let rows = encodings
            .iter()
            .map(|e| Tensor::new(field(e), &self.device))
            .collect::<candle_core::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        Tensor::stack(&rows, 0).map_err(|e| e.to_string())
    }
}

fn load_bert(config_json: &str, vb: VarBuilder) -> Result<(CrossEncoder, u32), String> {
    let config: BertConfig =
        serde_json::from_str(config_json).map_err(|e| format!("parse config: {e}"))?;
    let encoder = BertModel::load(vb.pp("bert"), &config).map_err(|e| format!("load model: {e}"))?;
    let pooler = linear(config.hidden_size, config.hidden_size, vb.pp("bert.pooler.dense"))
        .map_err(|e| format!("load pooler: {e}"))?;
    let classifier = linear(config.hidden_size, 1, vb.pp("classifier"))
        .map_err(|e| format!("load classifier: {e}"))?;
    Ok((
        CrossEncoder::Bert {
            encoder,
            pooler,
            classifier,
        },
        config.pad_token_id as u32,
    ))
}

fn load_xlm_roberta(config_json: &str, vb: VarBuilder) -> Result<(CrossEncoder, u32), String> {
    let config: XlmRobertaConfig =
        serde_json::from_str(config_json).map_err(|e| format!("parse config: {e}"))?;
    let model = XLMRobertaForSequenceClassification::new(1, &config, vb)
        .map_err(|e| format!("load model: {e}"))?;
    Ok((CrossEncoder::XlmRoberta(model), config.pad_token_id))
}
