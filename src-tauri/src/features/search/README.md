# search

Hybrid full-text and semantic search over a note vault. Combines SQLite FTS5
for keyword recall with BERT-based block embeddings for semantic retrieval.

## Architecture

Two embedding tables serve distinct roles:

- `block_embeddings`: one row per qualifying section (heading-bounded, >= 20
  words OR >= 10 lines). Used for re-ranking and block-level search results.
- `note_embeddings`: one row per note. Derived by mean-pooling the note's
  block embeddings, then L2-normalizing. Used for note-level KNN candidate
  retrieval in hybrid search.

Embedding pipeline order (invariant): block pass runs first; note composition
depends on block embeddings existing in the DB.

Two in-memory HNSW indices (`note_index`, `block_index`) mirror the DB tables.
Each index also stores vectors in an internal `vectors` HashMap -- this is a
redundant copy maintained by the index for fast sequential access; it is not
modified by the embedding pipeline directly.

`embed_batch` runs on a dedicated background thread with `QOS_CLASS_BACKGROUND`
on macOS. All embedding work inherits this priority; it does not block the UI.

## Design Decisions

**max_length = 256** (DL-001): PKM sections average 50-150 words (~70-200
tokens). Sections beyond 256 tokens are outlier long-form prose. At 256 tokens,
per-sample attention tensors are [B,12,256,256], keeping peak Metal buffer
accumulation below 1 GB at batch_size=16 and preventing cold-start memory
spikes on M-series hardware.

**batch_size = 16 in release** (DL-002): `BatchLongest` padding means one long
section pads the entire batch to max sequence length. At batch_size=16 and
max_length=256, the worst-case Metal tensor is [16,12,256,256], well within
M-series unified memory budget during cold embedding.

**Note embeddings composed from block mean-pool** (DL-003): `note_embeddings`
is derived by mean-pooling all block vectors for a note, then L2-normalizing.
Mean-pooling covers every qualifying section without truncation and produces a
single unit-length vector compatible with cosine KNN retrieval. Quality
trade-off: mean-pooling loses inter-section ordering but gains full content
coverage; expected comparable retrieval quality for PKM notes where section
order is not semantically load-bearing.

**MODEL_VERSION bump on logic change** (DL-004): Changing max_length or
composition strategy invalidates stored embeddings. Bumping `MODEL_VERSION` in
`vector_db.rs` causes `init_vector_schema` to detect the mismatch and call
`clear_all_embeddings`, wiping both tables atomically on next startup.

**Zero-block fallback to embed_one** (DL-005): Notes shorter than
`BLOCK_EMBED_MIN_WORDS` (20) AND `BLOCK_EMBED_MIN_LINES` (10) produce no block
embeddings. Mean-pooling an empty set is undefined, so these notes fall back to
`embed_one` on the FTS body or filename, ensuring every note has a
`note_embeddings` entry for KNN retrieval.

**Block pass before note composition** (DL-006): Note composition reads block
vectors from the DB. `handle_block_embed_batch` must complete before the
composition pass begins; `handle_embed_batch` enforces this ordering
unconditionally.

## Invariants

- `MODEL_VERSION` must be bumped whenever `max_length`, model weights, or
  composition strategy changes. Failing to bump leaves stale embeddings from a
  different encoding space in the DB, silently degrading search quality.
- `clear_all_embeddings` wipes both `note_embeddings` and `block_embeddings` in
  one transaction. Never clear one table without the other.
- `block_embeddings` must be fully written before the note composition pass
  reads them. The pipeline enforces this by calling `handle_block_embed_batch`
  first, unconditionally.
- Notes with zero qualifying block sections still receive a note embedding via
  `embed_one` fallback on FTS body or filename, ensuring `note_embeddings` is
  populated for every note in the vault.

## Rejected Alternatives

- **max_length = 128**: Too aggressive; medium-length sections (100-200 words)
  would be truncated, hurting retrieval quality for substantive PKM content.
- **Remove note_embeddings**: Breaks note-level KNN candidate retrieval; block-
  only search requires scanning all blocks per query which is slower at scale.
- **Keep separate note embed pass**: Embeds truncated FTS body (drops content
  beyond ~400 words) and adds a redundant GPU pass; does not fix the memory
  spike.
