use super::embeddings;

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
///
/// v3 is a correctness wipe, not an encoding change: builds between the f16
/// Metal switch and the ingest guard could store NaN vectors, and a NaN row in
/// a `DistCosine` graph degrades every query, not just its own.
pub const ENCODING_VERSION: u32 = 3;

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

/// Version of the [`embed_input`] layout. Bump when the text handed to the
/// encoder changes shape; the fingerprint then forces a re-embed.
pub const EMBED_INPUT_FORMAT_VERSION: u32 = 1;

const CONTEXT_SEPARATOR: &str = " › ";

/// Everything that decides what a stored vector means for a given model.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EncodingInputs {
    pub pooling: Pooling,
    pub query_prefix: Option<&'static str>,
    pub dims: usize,
    pub max_sequence_tokens: usize,
    pub pretruncate_bytes: usize,
    pub embed_input_format: u32,
    pub epoch: u32,
}

pub fn encoding_inputs(model: &EmbeddingModel) -> EncodingInputs {
    EncodingInputs {
        pooling: model.pooling,
        query_prefix: model.query_prefix,
        dims: model.dims,
        max_sequence_tokens: embeddings::MAX_SEQUENCE_TOKENS,
        pretruncate_bytes: embeddings::PRETRUNCATE_BYTES,
        embed_input_format: EMBED_INPUT_FORMAT_VERSION,
        epoch: ENCODING_VERSION,
    }
}

pub fn encoding_fingerprint(inputs: &EncodingInputs) -> String {
    let canonical = format!(
        "pooling={:?};query_prefix={:?};dims={};max_sequence_tokens={};pretruncate_bytes={};embed_input_format={};epoch={}",
        inputs.pooling,
        inputs.query_prefix,
        inputs.dims,
        inputs.max_sequence_tokens,
        inputs.pretruncate_bytes,
        inputs.embed_input_format,
        inputs.epoch,
    );
    blake3::hash(canonical.as_bytes()).to_hex()[..8].to_string()
}

/// The token stored in `embedding_meta.model_version`. Comparing against it is
/// what triggers wipe-and-re-embed, so it must change whenever either the model
/// or the encoding changes.
pub fn model_version_token(short_id: &str) -> String {
    // Resolved through the registry, not formatted from the raw settings value:
    // an id this build does not know embeds with the default model, and
    // recording the *requested* id would let a later build that adds that id
    // find a matching token and keep serving vectors another model produced.
    let model = lookup(short_id);
    format!(
        "{}@{}",
        model.short_id,
        encoding_fingerprint(&encoding_inputs(model))
    )
}

/// The text a section or note is embedded as: `title › ancestor › …`, a blank
/// line, then the body. `ancestors` are the section's strict ancestors; a
/// leading ancestor equal to the title is the note's own H1 and is dropped so
/// the title is not repeated.
pub fn embed_input(title: &str, ancestors: &[&str], body: &str) -> String {
    let title = title.trim();
    let ancestors = match ancestors.split_first() {
        Some((first, rest)) if first.trim() == title => rest,
        _ => ancestors,
    };
    let context: Vec<&str> = std::iter::once(title)
        .chain(ancestors.iter().map(|a| a.trim()))
        .filter(|part| !part.is_empty())
        .collect();
    if context.is_empty() {
        return body.to_string();
    }
    format!("{}\n\n{body}", context.join(CONTEXT_SEPARATOR))
}
