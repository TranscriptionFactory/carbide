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

**Cross-encoder rerank for context retrieval only** (DL-007): when the
caller asks for it and `search_rerank_enabled` is on (default off),
`run_hybrid_search` fuses `max(limit, 20)` candidates, scores each one's
best-matching section window with `cross-encoder/ms-marco-MiniLM-L6-v2`
(`cross_encoder.rs`), and reorders the top 20 by RRF (K=10) of fused rank and
reranker rank. The assistant's RAG retrieval and MCP ask for it. The omnibar
and search graph do not. Measured on the 60-query fixture (MRR; hybrid
0.808–0.816 across runs):

| Variant                       | MRR   | r@3  | semantic | long-section | added p50 |
| ----------------------------- | ----- | ---- | -------- | ------------ | --------- |
| 128 tokens, reranker order    | 0.773 | 0.85 | 0.312    | 0.660        | ~310 ms   |
| 256 tokens, reranker order    | 0.811 | 0.88 | 0.318    | 0.812        | ~835 ms   |
| 128 tokens, blended           | 0.807 | 0.88 | 0.398    | 0.792        | ~310 ms   |
| 256 tokens, blended (shipped) | 0.853 | 0.90 | 0.528    | 0.917        | ~835 ms   |

- 256 tokens: section windows are embedded at 256, and at 128 the answer
  in a long section is often cut off before the scorer sees it.
- Blending: on paraphrase queries the cross-encoder alone is worse than the
  bi-encoder. Pure reranker order threw away the fusion signal that got
  those right.
- CPU: one pair costs ~34 ms on CPU at 256 tokens, and Metal is only ~1.3x
  faster at this size. On Metal it would also wait behind background embed
  batches on the encoder's forward lock.
- Not in the omnibar: ~0.8–1.3 s per query does not fit a per-keystroke
  search.
- Bodies and the matched window keys are read while the DB and index locks
  are held. Passage text is built (from `embeddable_sections`, the exact text
  each window was embedded from) and scored after the locks are released.
- Any scorer failure returns the fused order unchanged.
- The window's own RRF scores are reassigned in the new order, so `score`
  stays monotone with list order and on the scale RAG fuses it at: RAG adds
  block-search RRF to it and re-sorts.

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
- **Bi-encoder fixes for hub notes** (DL-007 context): long multi-topic notes
  sit near the corpus centroid of mean-pooled note vectors. Max-sim over
  section vectors made this worse (hubs were 70% of a generic query's
  vector top-30, up from 57%). A centroid penalty (λ=0.2) cut hubs to 3% but
  cost 2% self-retrieval MRR.
- **Reranking every hybrid search, including the omnibar**: adds ~0.8 s per
  keystroke-driven query. The motivating hub case is already fixed by the
  exact-phrase fusion list, and the real vault did not show hub
  suppression from reranking.
- **`bge-reranker-base` / `-v2-m3`** (XLM-RoBERTa, 278M / 568M params):
  1.9 s / 5.4 s for 30 pairs at 256 tokens on Metal.
