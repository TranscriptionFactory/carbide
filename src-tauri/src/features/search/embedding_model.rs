/// How a model reduces `[batch, seq, dim]` token states to one vector per input.
/// Getting this wrong is silent: mean-pooling a CLS-trained model still yields
/// plausible unit vectors, just worse neighbours.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pooling {
    Cls,
    Mean,
}

pub struct EmbeddingModel {
    pub short_id: &'static str,
    pub hf_repo: &'static str,
    pub pooling: Pooling,
    /// Prepended to queries only. Asymmetric models are trained with it and
    /// lose recall without it; documents must never carry it.
    pub query_prefix: Option<&'static str>,
    pub dims: usize,
}

const RETRIEVAL_QUERY_PREFIX: &str =
    "Represent this sentence for searching relevant passages: ";

pub const DEFAULT_MODEL_SHORT_ID: &str = "snowflake-arctic-embed-xs";

/// Bumped whenever the vectors this app produces change meaning for an
/// unchanged model — pooling strategy, query prefix, chunking. It rides in the
/// stored `model_version` token so a change forces a wipe and re-embed.
pub const ENCODING_VERSION: u32 = 2;

pub const EMBEDDING_MODELS: &[EmbeddingModel] = &[
    EmbeddingModel {
        short_id: "snowflake-arctic-embed-xs",
        hf_repo: "Snowflake/snowflake-arctic-embed-xs",
        pooling: Pooling::Cls,
        query_prefix: Some(RETRIEVAL_QUERY_PREFIX),
        dims: 384,
    },
    EmbeddingModel {
        short_id: "snowflake-arctic-embed-s",
        hf_repo: "Snowflake/snowflake-arctic-embed-s",
        pooling: Pooling::Cls,
        query_prefix: Some(RETRIEVAL_QUERY_PREFIX),
        dims: 384,
    },
    EmbeddingModel {
        short_id: "snowflake-arctic-embed-m",
        hf_repo: "Snowflake/snowflake-arctic-embed-m",
        pooling: Pooling::Cls,
        query_prefix: Some(RETRIEVAL_QUERY_PREFIX),
        dims: 768,
    },
    EmbeddingModel {
        short_id: "bge-small-en-v1.5",
        hf_repo: "BAAI/bge-small-en-v1.5",
        pooling: Pooling::Cls,
        query_prefix: Some(RETRIEVAL_QUERY_PREFIX),
        dims: 384,
    },
    EmbeddingModel {
        short_id: "all-MiniLM-L6-v2",
        hf_repo: "sentence-transformers/all-MiniLM-L6-v2",
        pooling: Pooling::Mean,
        query_prefix: None,
        dims: 384,
    },
];

/// Resolves a settings short id to its registry entry, falling back to the
/// default model for ids this build does not know.
pub fn lookup(short_id: &str) -> &'static EmbeddingModel {
    EMBEDDING_MODELS
        .iter()
        .find(|m| m.short_id == short_id)
        .unwrap_or_else(|| {
            EMBEDDING_MODELS
                .iter()
                .find(|m| m.short_id == DEFAULT_MODEL_SHORT_ID)
                .expect("default embedding model missing from registry")
        })
}

/// The token stored in `embedding_meta.model_version`. Comparing against it is
/// what triggers wipe-and-re-embed, so it must change whenever either the model
/// or the encoding changes.
pub fn model_version_token(short_id: &str) -> String {
    format!("{short_id}@v{ENCODING_VERSION}")
}
