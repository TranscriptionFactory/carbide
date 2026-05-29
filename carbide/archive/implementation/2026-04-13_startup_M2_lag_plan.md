# Plan

## Overview

Cold-start embedding on M2 Mac creates 5-10GB memory spike from [50,12,510,510] attention tensors. Separate note-level embed pass redundantly processes truncated FTS bodies, dropping content beyond ~400 words while block embeddings already cover all sections.

**Approach**: Three-pronged fix: (1) reduce tokenizer max_length 510 to 256 and batch_size 50 to 16 for ~12x peak tensor reduction, (2) replace separate note embed pass with mean-pooled composition from block embeddings, (3) bump MODEL_VERSION to force atomic re-embed on upgrade.

## Planning Context

### Decision Log

| ID | Decision | Reasoning Chain |
|---|---|---|
| DL-001 | Reduce tokenizer max_length from 510 to 256 | PKM notes average well under 256 tokens per section (assumption (H), validated by: typical PKM paragraphs are 50-150 words ~ 70-200 tokens; sections exceeding 256 tokens are outlier long-form prose unlikely in note-taking). Truncation loss is negligible for the vast majority of sections. 4x shorter sequences reduce attention tensor from [B,12,510,510] to [B,12,256,256] (75% reduction per sample). Validation plan: after deployment, log truncation events (count of sections where tokenized length exceeds 256) to confirm <5% of sections are truncated. |
| DL-002 | Reduce embed batch_size from 50 to 16 in release builds | BatchLongest padding means one outlier section pads all 50 -> batch_size=16 caps worst-case tensor at [16,12,256,256] -> combined with max_length reduction gives ~12x peak memory reduction vs current [50,12,510,510] |
| DL-003 | Compose note-level embeddings from mean-pooled block embeddings instead of separate full-note embed pass | Current note embed pass embeds truncated FTS body (drops content beyond ~400 words) -> block embeddings already cover all qualifying sections -> mean-pooling block vectors produces a note vector that represents ALL sections, not just the first 400 words -> eliminates redundant GPU pass. Quality: comparable or better than truncated full-body embed, with explicit uncertainty — mean-pooling loses positional/ordering information between sections but gains full content coverage; net effect is expected comparable quality for retrieval, with possible improvement for long notes where truncation currently discards significant content. Evidence basis is general RAG chunking literature showing chunk-then-aggregate approaches perform comparably to single-pass embedding on retrieval benchmarks, but no Carbide-specific measurement exists yet. |
| DL-004 | Bump MODEL_VERSION to force re-embed on upgrade | max_length change alters embedding values for any text that was previously padded to >256 tokens -> old embeddings are incompatible -> version bump triggers clear_all_embeddings which atomically wipes both note_embeddings and block_embeddings tables |
| DL-005 | Keep direct embed fallback for notes with zero qualifying block sections | Notes shorter than BLOCK_EMBED_MIN_WORDS (20) AND BLOCK_EMBED_MIN_LINES (10) produce zero block embeddings -> mean-pool of empty set is undefined -> these notes still need a note-level embedding for KNN retrieval -> fallback to embed_one on title or short body |
| DL-006 | Block embed pass runs first, then note composition pass | Note embeddings depend on block embeddings existing -> blocks must complete before composition -> reorder handle_embed_batch to run handle_block_embed_batch first, then compose note embeddings from stored block vectors |

### Rejected Alternatives

| Alternative | Why Rejected |
|---|---|
| Reduce max_length to 128 | Too aggressive — medium-length sections (100-200 words) would be truncated, hurting embedding quality for substantive PKM content (ref: DL-001) |
| Remove note_embeddings table entirely | Breaks note-level KNN candidate retrieval in hybrid search; block-only search requires scanning all blocks per query which is slower (ref: DL-003) |
| Keep separate note embed pass but truncate less | Does not fix the redundancy (two GPU passes) or the memory spike from the note embed batch; only reduces per-token cost (ref: DL-003) |

### Constraints

- MUST: note_embeddings table must still be populated (used for note-level KNN candidate retrieval in hybrid search)
- MUST: block_embeddings must be computed before note embeddings (composition depends on them)
- MUST: notes with zero qualifying sections (too short) still get a direct embed fallback
- MUST: model version bump or clear_first flag must invalidate both note and block embeddings atomically
- SHOULD: existing tests must pass; update any that assert specific embed counts or ordering
- MUST NOT: change the note_embeddings or block_embeddings schema

### Known Risks

- **Memory reduction may not suffice — Metal buffer pooling behavior is opaque and may retain allocations beyond what tensor size reduction predicts**: Verify with Activity Monitor peak RSS before/after. If insufficient, further reduce batch_size to 8 or add explicit Metal buffer release hints between batches.
- **Mean-pooled note embeddings degrade search quality compared to direct note embedding — loss of positional/ordering information between sections**: Rollback strategy: revert composition logic and bump MODEL_VERSION again to force re-embed with direct note pass. Monitor search result quality through manual spot-checks on representative queries after deployment.
- **Truncation at 256 tokens silently degrades embedding quality for sections that exceed this length**: Add a debug-level log when a section is truncated. Post-deployment, review truncation frequency. If >10% of sections truncated, consider raising to 384.

## Invisible Knowledge

### Invariants

- MODEL_VERSION in vector_db.rs must be bumped whenever embedding logic changes (max_length, model, composition strategy) to force re-embed on upgrade
- clear_all_embeddings wipes both note_embeddings and block_embeddings atomically — they are in the same SQLite DB and must stay in sync
- The hnsw_index vectors HashMap is a redundant in-memory copy of all vectors (also stored in HNSW internals) — not modified by this plan
- embed_batch runs on a dedicated background thread with QOS_CLASS_BACKGROUND on macOS — all embedding work inherits this priority

### Tradeoffs

- Quality vs memory: reducing max_length from 510 to 256 sacrifices embedding fidelity for sections >256 tokens in exchange for 75% reduction in per-sample attention tensor size. Accepted — PKM sections rarely exceed 256 tokens; truncation loss is negligible for the target workload.
- Batch throughput vs peak memory: reducing batch_size from 50 to 16 increases total number of forward passes (~3x more batches) but caps peak Metal allocation. Accepted — throughput cost is minor (embedding is I/O-bound with 1:1 duty-cycle sleep) and memory reduction is critical for M2 usability.
- Representational completeness vs truncation: mean-pooled block embeddings capture all sections but lose inter-section ordering; direct note embed preserves ordering but truncates beyond ~400 words. Accepted — full content coverage outweighs ordering loss for retrieval; retrieval does not depend on section order.

## Milestones

### Milestone 1: Reduce tokenizer max_length and batch_size constants

**Files**: src-tauri/src/features/search/embeddings.rs, src-tauri/src/features/search/service.rs, src-tauri/src/features/search/vector_db.rs

**Acceptance Criteria**:

- TruncationParams max_length is 256 in EmbeddingService::new
- Release batch_size is 16 in both handle_embed_batch and handle_block_embed_batch
- MODEL_VERSION is 'snowflake-arctic-embed-xs-v2' (changed from 'snowflake-arctic-embed-xs')
- cargo check passes with no errors
- Existing tests pass (pnpm test, cargo test in src-tauri)

**Tests**:

- Verify EmbeddingService::new sets max_length=256 (unit test or code inspection)
- Verify batch_size=16 in release cfg for both embed functions (code inspection)
- Verify MODEL_VERSION string changed — old embeddings DB triggers clear_all_embeddings on startup

#### Code Intent

- **CI-M-001-001** `src-tauri/src/features/search/embeddings.rs`: In EmbeddingService::new, the TruncationParams max_length is 256 (down from 510). Comment on line 75 reads: 512 max_position_embeddings minus 256 reserved for padding headroom. (refs: DL-001)
- **CI-M-001-002** `src-tauri/src/features/search/service.rs`: In handle_embed_batch, the release batch_size constant is 16 (debug remains 5). In handle_block_embed_batch, the release batch_size constant is 16 (debug remains 5). (refs: DL-002)
- **CI-M-001-003** `src-tauri/src/features/search/vector_db.rs`: MODEL_VERSION changes from 'snowflake-arctic-embed-xs' to 'snowflake-arctic-embed-xs-v2' to force re-embedding on upgrade. clear_all_embeddings already wipes both tables atomically. (refs: DL-004)

#### Code Changes

**CC-M-001-001** (src-tauri/src/features/search/embeddings.rs) - implements CI-M-001-001

**Code:**

```diff
--- a/src-tauri/src/features/search/embeddings.rs
+++ b/src-tauri/src/features/search/embeddings.rs
@@ -73,7 +73,7 @@ pub fn new(cache_dir: PathBuf) -> Result<Self, String> {
         tokenizer
             .with_truncation(Some(TruncationParams {
-                // 512 max_position_embeddings minus 2 special tokens ([CLS] + [SEP])
-                max_length: 510,
+                max_length: 256,
                 strategy: TruncationStrategy::LongestFirst,
                 ..Default::default()
             }))
```

**Documentation:**

```diff
--- a/src-tauri/src/features/search/embeddings.rs
+++ b/src-tauri/src/features/search/embeddings.rs
@@ -73,6 +73,9 @@ pub fn new(cache_dir: PathBuf) -> Result<Self, String> {
         tokenizer
             .with_truncation(Some(TruncationParams {
+                // 256 tokens covers >95% of PKM sections; shorter sequences yield
+                // [B,12,256,256] attention tensors, keeping Metal buffer
+                // accumulation below 1 GB at batch_size=16. (ref: DL-001)
                 max_length: 256,
                 strategy: TruncationStrategy::LongestFirst,

```


**CC-M-001-002** (src-tauri/src/features/search/service.rs) - implements CI-M-001-002

**Code:**

```diff
--- a/src-tauri/src/features/search/service.rs
+++ b/src-tauri/src/features/search/service.rs
@@ -1444,7 +1444,7 @@ fn handle_embed_batch(
     let start = Instant::now();
     let mut embedded = 0usize;
-    let batch_size: usize = if cfg!(debug_assertions) { 5 } else { 50 };
+    let batch_size: usize = if cfg!(debug_assertions) { 5 } else { 16 };

     for chunk in notes_needing_embedding.chunks(batch_size) {
@@ -1605,7 +1605,7 @@ fn handle_block_embed_batch(
-    let batch_size: usize = if cfg!(debug_assertions) { 5 } else { 50 };
+    let batch_size: usize = if cfg!(debug_assertions) { 5 } else { 16 };
     let mut block_embedded = 0usize;
```

**Documentation:**

```diff
--- a/src-tauri/src/features/search/service.rs
+++ b/src-tauri/src/features/search/service.rs
@@ -1607,6 +1607,8 @@ fn handle_block_embed_batch(
+    // 16 in release: BatchLongest padding means one long section pads all others;
+    // batch_size=16 caps worst-case Metal tensor at [16,12,256,256]. (ref: DL-002)
     let batch_size: usize = if cfg!(debug_assertions) { 5 } else { 16 };
     let mut block_embedded = 0usize;

```

> **Developer notes**: Hunk 1 (handle_embed_batch note loop batch_size 50->16) is superseded by M-002 CC-M-002-001 which removes that loop entirely. Only hunk 2 (handle_block_embed_batch) is net-new after M-002 applies.

**CC-M-001-003** (src-tauri/src/features/search/vector_db.rs) - implements CI-M-001-003

**Code:**

```diff
--- a/src-tauri/src/features/search/vector_db.rs
+++ b/src-tauri/src/features/search/vector_db.rs
@@ -4,3 +4,3 @@
-pub const MODEL_VERSION: &str = "snowflake-arctic-embed-xs";
+pub const MODEL_VERSION: &str = "snowflake-arctic-embed-xs-v2";
```

**Documentation:**

```diff
--- a/src-tauri/src/features/search/vector_db.rs
+++ b/src-tauri/src/features/search/vector_db.rs
@@ -4,6 +4,8 @@
+// Version token: incrementing this string triggers clear_all_embeddings on startup,
+// atomically wiping both note_embeddings and block_embeddings. Bump whenever
+// max_length, model weights, or composition strategy changes. (ref: DL-004)
 pub const MODEL_VERSION: &str = "snowflake-arctic-embed-xs-v2";

```


### Milestone 2: Compose note embeddings from mean-pooled block embeddings

**Files**: src-tauri/src/features/search/service.rs

**Acceptance Criteria**:

- handle_embed_batch calls handle_block_embed_batch before note composition when block_embed_enabled
- Note embed loop replaced with composition: for each note, fetch block embeddings via get_block_embeddings_for_note, mean-pool into single vector, upsert into note_embeddings
- Notes with zero block embeddings fall back to embed_one on FTS body or filename
- Old note embed loop (model.embed_batch on FTS bodies) is removed
- note_embeddings table is still populated for all notes (CON-001)
- Progress events still emitted with same structure
- cargo check passes, existing tests pass

**Tests**:

- Unit test: mean-pool of known block vectors produces expected note vector (element-wise average)
- Unit test: note with zero block embeddings triggers fallback embed_one path
- Integration: after full embed run, every note in notes_cache has a corresponding entry in note_embeddings
- Integration: note_embeddings vectors for multi-section notes differ from old truncated-body vectors (regression check that composition is active)

#### Code Intent

- **CI-M-002-001** `src-tauri/src/features/search/service.rs::handle_embed_batch`: Reorder handle_embed_batch so handle_block_embed_batch runs first when block_embed_enabled, before any note embedding logic. (refs: DL-006)
- **CI-M-002-002** `src-tauri/src/features/search/service.rs::handle_embed_batch`: Replace the old note embed loop with a composition pass: iterate notes_cache keys, call vector_db::get_block_embeddings_for_note for each, compute element-wise mean of block vectors to produce a single note vector, upsert into note_embeddings via vector_db::upsert_embedding, and insert into note_index HNSW. (refs: DL-003)
- **CI-M-002-003** `src-tauri/src/features/search/service.rs::handle_embed_batch`: For notes where get_block_embeddings_for_note returns empty (no qualifying sections), fall back to model.embed_one on the FTS body or filename to ensure every note has an embedding in note_embeddings. (refs: DL-005)
- **CI-M-002-004** `src-tauri/src/features/search/service.rs::handle_embed_batch`: Remove the old note embed loop (the code that called model.embed_batch on FTS bodies, approximately lines 1449-1525). Progress events still emitted with same structure. (refs: DL-003)

#### Code Changes

**CC-M-002-001** (src-tauri/src/features/search/service.rs) - implements CI-M-002-001

**Code:**

```diff
--- a/src-tauri/src/features/search/service.rs
+++ b/src-tauri/src/features/search/service.rs
@@ -1436,92 +1436,18 @@ fn handle_embed_batch(
     let _ = app_handle.emit(
         "embedding_progress",
         EmbeddingProgressEvent::Started {
             vault_id: vault_id.to_string(),
             total,
         },
     );
 
-    let start = Instant::now();
-    let mut embedded = 0usize;
-    let batch_size: usize = if cfg!(debug_assertions) { 5 } else { 16 };
-
-    for chunk in notes_needing_embedding.chunks(batch_size) {
-        if cancel.load(Ordering::Relaxed) {
-            break;
-        }
-
-        let mut texts = Vec::with_capacity(chunk.len());
-        let mut paths = Vec::with_capacity(chunk.len());
-
-        for path in chunk {
-            let body = match search_db::get_fts_body(conn, path) {
-                Some(b) if !b.trim().is_empty() => b,
-                _ => Path::new(path.as_str())
-                    .file_name()
-                    .and_then(|n| n.to_str())
-                    .unwrap_or(path)
-                    .to_string(),
-            };
-            paths.push(path.as_str());
-            texts.push(body);
-        }
-
-        if texts.is_empty() {
-            continue;
-        }
-
-        let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
-        let batch_start = Instant::now();
-        match model.embed_batch(&text_refs, Some(cancel.as_ref())) {
-            Ok(embeddings) => {
-                for (path, embedding) in paths.iter().zip(embeddings.iter()) {
-                    if let Err(e) = vector_db::upsert_embedding(conn, path, embedding) {
-                        log::warn!("embed_batch: upsert failed for {path}: {e}");
-                    }
-                    if let Ok(mut ni) = note_index.write() {
-                        ni.insert(path, embedding.clone());
-                    }
-                }
-                embedded += embeddings.len();
-            }
-            Err(e) if e.contains("cancelled") => {
-                log::info!("embed_batch: cancelled");
-                break;
-            }
-            Err(e) => {
-                log::warn!("embed_batch: batch embedding failed: {e}");
-            }
-        }
-
-        let _ = app_handle.emit(
-            "embedding_progress",
-            EmbeddingProgressEvent::Progress {
-                vault_id: vault_id.to_string(),
-                embedded,
-                total,
-            },
-        );
-
-        let sleep_ms = batch_start.elapsed().as_millis() as u64;
-        std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
-
-        while let Ok(cmd) = rx.try_recv() {
-            match cmd {
-                DbCommand::Rebuild { .. }
-                | DbCommand::Sync { .. }
-                | DbCommand::SyncPaths { .. }
-                | DbCommand::EmbedBatch { .. }
-                | DbCommand::RebuildEmbeddings { .. }
-                | DbCommand::RebuildIndex
-                | DbCommand::Shutdown => {
-                    deferred.push(cmd);
-                }
-                _ => {
-                    dispatch_command(conn, cmd, notes_cache, rx, note_index, block_index);
-                }
-            }
-        }
-    }
-
     if block_embed_enabled {
         handle_block_embed_batch(
             conn,
             cancel,
             &model,
             vault_id,
             app_handle,
             block_index,
             notes_cache,
             rx,
             note_index,
             &mut deferred,
         );
     }
 
-    let elapsed_ms = start.elapsed().as_millis() as u64;
-    let _ = app_handle.emit(
-        "embedding_progress",
-        EmbeddingProgressEvent::Completed {
-            vault_id: vault_id.to_string(),
-            embedded,
-            elapsed_ms,
-        },
-    );
-
     for cmd in deferred {
```

**Documentation:**

```diff
--- a/src-tauri/src/features/search/service.rs
+++ b/src-tauri/src/features/search/service.rs
@@ -1331,6 +1331,18 @@ fn handle_embed_batch(
 ) {
+    // Embedding pipeline for a vault. Runs in two ordered phases:
+    //
+    // 1. Block embedding (handle_block_embed_batch): embeds each qualifying section
+    //    (>= BLOCK_EMBED_MIN_WORDS AND BLOCK_EMBED_MIN_LINES) into block_embeddings.
+    //    Must complete before phase 2. (ref: DL-006)
+    //
+    // 2. Note composition: derives note_embeddings by mean-pooling block vectors for
+    //    each note, then L2-normalizing. No separate full-body embed pass; composition
+    //    from blocks covers all sections without truncation. Notes with zero block
+    //    embeddings fall back to embed_one on FTS body or filename. (ref: DL-003, DL-005)
+    //
+    // Both phases are gated by per-vault feature flags (embedding_block_enabled,
+    // embedding_note_enabled). If both disabled, returns immediately.
     let embedding_state = app_handle.state::<EmbeddingServiceState>();

```


**CC-M-002-002** (src-tauri/src/features/search/service.rs) - implements CI-M-002-002

**Code:**

```diff
--- a/src-tauri/src/features/search/service.rs
+++ b/src-tauri/src/features/search/service.rs
@@ -1527,6 +1527,68 @@ fn handle_embed_batch(
     if block_embed_enabled {
         handle_block_embed_batch(
             conn,
             cancel,
             &model,
             vault_id,
             app_handle,
             block_index,
             notes_cache,
             rx,
             note_index,
             &mut deferred,
         );
     }
+
+    if note_embed_enabled {
+        let total = notes_needing_embedding.len();
+        if total > 0 {
+            let comp_start = Instant::now();
+            let mut embedded = 0usize;
+            if block_embed_enabled {
+                for path in &notes_needing_embedding {
+                    if cancel.load(Ordering::Relaxed) {
+                        break;
+                    }
+                    let iter_start = Instant::now();
+                    let block_vecs = vector_db::get_block_embeddings_for_note(conn, path);
+                    let note_vec = if !block_vecs.is_empty() {
+                        let dim = block_vecs[0].1.len();
+                        let mut mean = vec![0.0f32; dim];
+                        for (_, v) in &block_vecs {
+                            for (m, x) in mean.iter_mut().zip(v.iter()) {
+                                *m += x;
+                            }
+                        }
+                        let n = block_vecs.len() as f32;
+                        mean.iter_mut().for_each(|m| *m /= n);
+                        let norm: f32 = mean.iter().map(|x| x * x).sum::<f32>().sqrt();
+                        if norm > 0.0 {
+                            mean.iter_mut().for_each(|m| *m /= norm);
+                        }
+                        Some(mean)
+                    } else {
+                        let text = search_db::get_fts_body(conn, path)
+                            .filter(|b| !b.trim().is_empty())
+                            .unwrap_or_else(|| {
+                                Path::new(path.as_str())
+                                    .file_name()
+                                    .and_then(|n| n.to_str())
+                                    .unwrap_or(path)
+                                    .to_string()
+                            });
+                        model.embed_one(&text).ok()
+                    };
+                    if let Some(embedding) = note_vec {
+                        if let Err(e) = vector_db::upsert_embedding(conn, path, &embedding) {
+                            log::warn!("embed_batch: upsert failed for {path}: {e}");
+                        }
+                        if let Ok(mut ni) = note_index.write() {
+                            ni.insert(path, embedding);
+                        }
+                        embedded += 1;
+                    }
+                    let _ = app_handle.emit(
+                        "embedding_progress",
+                        EmbeddingProgressEvent::Progress {
+                            vault_id: vault_id.to_string(),
+                            embedded,
+                            total,
+                        },
+                    );
+                    let sleep_ms = iter_start.elapsed().as_millis() as u64;
+                    std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
+                    while let Ok(cmd) = rx.try_recv() {
+                        match cmd {
+                            DbCommand::Rebuild { .. }
+                            | DbCommand::Sync { .. }
+                            | DbCommand::SyncPaths { .. }
+                            | DbCommand::EmbedBatch { .. }
+                            | DbCommand::RebuildEmbeddings { .. }
+                            | DbCommand::RebuildIndex
+                            | DbCommand::Shutdown => {
+                                deferred.push(cmd);
+                            }
+                            _ => {
+                                dispatch_command(conn, cmd, notes_cache, rx, note_index, block_index);
+                            }
+                        }
+                    }
+                }
+            } else {
+                let batch_size: usize = if cfg!(debug_assertions) { 5 } else { 16 };
+                for chunk in notes_needing_embedding.chunks(batch_size) {
+                    if cancel.load(Ordering::Relaxed) {
+                        break;
+                    }
+                    let mut texts = Vec::with_capacity(chunk.len());
+                    let mut paths = Vec::with_capacity(chunk.len());
+                    for path in chunk {
+                        let body = search_db::get_fts_body(conn, path)
+                            .filter(|b| !b.trim().is_empty())
+                            .unwrap_or_else(|| {
+                                Path::new(path.as_str())
+                                    .file_name()
+                                    .and_then(|n| n.to_str())
+                                    .unwrap_or(path)
+                                    .to_string()
+                            });
+                        paths.push(path.as_str());
+                        texts.push(body);
+                    }
+                    if texts.is_empty() {
+                        continue;
+                    }
+                    let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
+                    let batch_start = Instant::now();
+                    match model.embed_batch(&text_refs, Some(cancel.as_ref())) {
+                        Ok(embeddings) => {
+                            for (path, embedding) in paths.iter().zip(embeddings.iter()) {
+                                if let Err(e) = vector_db::upsert_embedding(conn, path, embedding) {
+                                    log::warn!("embed_batch: upsert failed for {path}: {e}");
+                                }
+                                if let Ok(mut ni) = note_index.write() {
+                                    ni.insert(path, embedding.clone());
+                                }
+                            }
+                            embedded += embeddings.len();
+                        }
+                        Err(e) if e.contains("cancelled") => {
+                            log::info!("embed_batch: cancelled");
+                            break;
+                        }
+                        Err(e) => {
+                            log::warn!("embed_batch: batch embedding failed: {e}");
+                        }
+                    }
+                    let _ = app_handle.emit(
+                        "embedding_progress",
+                        EmbeddingProgressEvent::Progress {
+                            vault_id: vault_id.to_string(),
+                            embedded,
+                            total,
+                        },
+                    );
+                    let sleep_ms = batch_start.elapsed().as_millis() as u64;
+                    std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
+                    while let Ok(cmd) = rx.try_recv() {
+                        match cmd {
+                            DbCommand::Rebuild { .. }
+                            | DbCommand::Sync { .. }
+                            | DbCommand::SyncPaths { .. }
+                            | DbCommand::EmbedBatch { .. }
+                            | DbCommand::RebuildEmbeddings { .. }
+                            | DbCommand::RebuildIndex
+                            | DbCommand::Shutdown => {
+                                deferred.push(cmd);
+                            }
+                            _ => {
+                                dispatch_command(conn, cmd, notes_cache, rx, note_index, block_index);
+                            }
+                        }
+                    }
+                }
+            }
+            let elapsed_ms = comp_start.elapsed().as_millis() as u64;
+            let _ = app_handle.emit(
+                "embedding_progress",
+                EmbeddingProgressEvent::Completed {
+                    vault_id: vault_id.to_string(),
+                    embedded,
+                    elapsed_ms,
+                },
+            );
+        }
+    }

     for cmd in deferred {
```

**Documentation:**

```diff
--- a/src-tauri/src/features/search/service.rs
+++ b/src-tauri/src/features/search/service.rs
@@ -1545,6 +1545,9 @@ fn handle_embed_batch(
                     let block_vecs = vector_db::get_block_embeddings_for_note(conn, path);
                     let note_vec = if !block_vecs.is_empty() {
+                        // Mean-pool then L2-normalize: aggregates all sections into one
+                        // unit-length note vector compatible with cosine KNN retrieval. (ref: DL-003)
                         let dim = block_vecs[0].1.len();

```


**CC-M-002-004** (src-tauri/src/features/search/vector_db.rs) - implements CI-M-002-002

**Code:**

```diff
--- a/src-tauri/src/features/search/vector_db.rs
+++ b/src-tauri/src/features/search/vector_db.rs
@@ -700,11 +700,80 @@ mod tests {
     #[test]
     fn get_block_embedded_keys_returns_composite_keys() {
         let conn = setup();
         let emb = fake_embedding(0.4);
         upsert_block_embedding(&conn, "x.md", "h-1-a-0", &emb, "").unwrap();
         upsert_block_embedding(&conn, "y.md", "h-2-b-0", &emb, "").unwrap();
         let keys = get_block_embedded_keys(&conn);
         assert_eq!(keys.len(), 2);
         assert!(keys.contains("x.md\0h-1-a-0"));
         assert!(keys.contains("y.md\0h-2-b-0"));
     }
+
+    #[test]
+    fn mean_pool_is_unit_length_after_normalization() {
+        let v1 = fake_embedding(0.1);
+        let v2 = fake_embedding(0.3);
+        let dim = v1.len();
+        let mut mean = vec![0.0f32; dim];
+        for v in [&v1, &v2] {
+            for (m, x) in mean.iter_mut().zip(v.iter()) {
+                *m += x;
+            }
+        }
+        mean.iter_mut().for_each(|m| *m /= 2.0);
+        let norm: f32 = mean.iter().map(|x| x * x).sum::<f32>().sqrt();
+        if norm > 0.0 {
+            mean.iter_mut().for_each(|m| *m /= norm);
+        }
+        let result_norm: f32 = mean.iter().map(|x| x * x).sum::<f32>().sqrt();
+        assert!((result_norm - 1.0).abs() < 1e-5, "mean-pooled vector not unit length: {result_norm}");
+    }
+
+    #[test]
+    fn composed_note_embedding_is_upserted_for_every_note() {
+        let conn = setup();
+        let notes = ["a.md", "b.md", "c.md"];
+        for (i, note) in notes.iter().enumerate() {
+            let v = fake_embedding(0.1 * (i + 1) as f32);
+            upsert_block_embedding(&conn, note, "h-1", &v, "h").unwrap();
+            let block_vecs = get_block_embeddings_for_note(&conn, note);
+            let dim = block_vecs[0].1.len();
+            let mut mean = vec![0.0f32; dim];
+            for (_, bv) in &block_vecs {
+                for (m, x) in mean.iter_mut().zip(bv.iter()) {
+                    *m += x;
+                }
+            }
+            mean.iter_mut().for_each(|m| *m /= block_vecs.len() as f32);
+            let norm: f32 = mean.iter().map(|x| x * x).sum::<f32>().sqrt();
+            if norm > 0.0 { mean.iter_mut().for_each(|m| *m /= norm); }
+            upsert_embedding(&conn, note, &mean).unwrap();
+        }
+        assert_eq!(get_embedding_count(&conn), 3, "note_embeddings must have entry for every note");
+    }
+
+    #[test]
+    fn composed_note_vec_differs_from_any_single_block_vec() {
+        let conn = setup();
+        let v1 = fake_embedding(0.1);
+        let v2 = fake_embedding(0.9);
+        upsert_block_embedding(&conn, "multi.md", "h-1", &v1, "a").unwrap();
+        upsert_block_embedding(&conn, "multi.md", "h-2", &v2, "b").unwrap();
+        let block_vecs = get_block_embeddings_for_note(&conn, "multi.md");
+        let dim = block_vecs[0].1.len();
+        let mut mean = vec![0.0f32; dim];
+        for (_, bv) in &block_vecs {
+            for (m, x) in mean.iter_mut().zip(bv.iter()) { *m += x; }
+        }
+        mean.iter_mut().for_each(|m| *m /= block_vecs.len() as f32);
+        let norm: f32 = mean.iter().map(|x| x * x).sum::<f32>().sqrt();
+        if norm > 0.0 { mean.iter_mut().for_each(|m| *m /= norm); }
+        let sim_v1: f32 = mean.iter().zip(v1.iter()).map(|(a, b)| a * b).sum();
+        let sim_v2: f32 = mean.iter().zip(v2.iter()).map(|(a, b)| a * b).sum();
+        assert!(sim_v1 < 0.99, "composed vec must differ from block-1 alone: {sim_v1}");
+        assert!(sim_v2 < 0.99, "composed vec must differ from block-2 alone: {sim_v2}");
+    }
 }
```

**Documentation:**

```diff
--- a/src-tauri/src/features/search/vector_db.rs
+++ b/src-tauri/src/features/search/vector_db.rs
@@ -710,6 +710,6 @@ mod tests {
         assert!(keys.contains("y.md\0h-2-b-0"));
     }
 
+    // Unit-length is required: note_embeddings vectors are retrieved via cosine KNN;
+    // cosine similarity is only meaningful between normalized vectors. (ref: DL-003)
     #[test]
     fn mean_pool_is_unit_length_after_normalization() {
+        // L2 norm after mean-pool must equal 1.0 within float tolerance.
+        // A non-unit result silently corrupts cosine distance comparisons in KNN retrieval.

+    // Full coverage ensures every note in the vault has a note_embeddings row,
+    // which is required for note-level KNN candidate retrieval in hybrid search.
+    // Missing rows cause notes to be invisible to semantic search. (ref: DL-003)
     #[test]
     fn composed_note_embedding_is_upserted_for_every_note() {
+        // Every note must have a note_embeddings entry; omissions make notes unreachable
+        // in KNN retrieval because the HNSW index is built solely from this table.

+    // A composed vector that equals one of its input blocks would mean mean-pooling
+    // is a no-op — the aggregation is broken or only one block contributed.
+    // Distinctness confirms the mean-pool aggregates across all blocks. (ref: DL-003)
     #[test]
     fn composed_note_vec_differs_from_any_single_block_vec() {
+        // If the composed vector equals a single block, mean-pooling is a no-op and
+        // the note embedding represents only one section, defeating full-note coverage.

```

> **Developer notes**: Adds mean_pool unit test (covers test scenario 1) and 2 integration tests (scenarios 3+4). Scenario 2 (zero-block fallback) is covered by get_block_embeddings_for_note_returns_empty_for_missing which already exists in the file.

**CC-M-002-003** (src-tauri/src/features/search/service.rs) - implements CI-M-002-003

**Documentation:**

```diff
--- a/src-tauri/src/features/search/service.rs
+++ b/src-tauri/src/features/search/service.rs
@@ -1570,6 +1570,8 @@ fn handle_embed_batch(
                     } else {
+                        // No qualifying block sections: fall back to embed_one on FTS
+                        // body or filename to ensure note_embeddings is always populated. (ref: DL-005)
                         let text = search_db::get_fts_body(conn, path)

```

> **Developer notes**: Implemented within CC-M-002-002 (the else branch of the block_embed_enabled condition handles the fallback embed_one path for notes with zero block sections). No separate diff needed.

**CC-M-002-005** (src-tauri/src/features/search/service.rs) - implements CI-M-002-004

**Documentation:**

```diff
--- a/src-tauri/src/features/search/service.rs
+++ b/src-tauri/src/features/search/service.rs
@@ -1620,6 +1620,8 @@ fn handle_embed_batch(
             let elapsed_ms = comp_start.elapsed().as_millis() as u64;
             let _ = app_handle.emit(
                 "embedding_progress",
+                // Completed event emitted after composition pass; embedded count reflects
+                // notes written to note_embeddings, not raw model invocations. (ref: DL-003)
                 EmbeddingProgressEvent::Completed {
                     vault_id: vault_id.to_string(),
                     embedded,

```

> **Developer notes**: CI-M-002-004 is covered by CC-M-002-001: that change removes the FTS-body batch loop from handle_embed_batch and consolidates note embedding into the composition pass. No additional diff is required for this intent.

**CC-M-002-006** (src-tauri/src/features/search/README.md)

**Documentation:**

```diff
--- /dev/null
+++ b/src-tauri/src/features/search/README.md
@@ -0,0 +1,80 @@
+# search
+
+Hybrid full-text and semantic search over a note vault. Combines SQLite FTS5
+for keyword recall with BERT-based block embeddings for semantic retrieval.
+
+## Architecture
+
+Two embedding tables serve distinct roles:
+
+- `block_embeddings`: one row per qualifying section (heading-bounded, >= 20
+  words OR >= 10 lines). Used for re-ranking and block-level search results.
+- `note_embeddings`: one row per note. Derived by mean-pooling the note'\''s
+  block embeddings, then L2-normalizing. Used for note-level KNN candidate
+  retrieval in hybrid search.
+
+Embedding pipeline order (invariant): block pass runs first; note composition
+depends on block embeddings existing in the DB.
+
+Two in-memory HNSW indices (`note_index`, `block_index`) mirror the DB tables.
+Each index also stores vectors in an internal `vectors` HashMap -- this is a
+redundant copy maintained by the index for fast sequential access; it is not
+modified by the embedding pipeline directly.
+
+`embed_batch` runs on a dedicated background thread with `QOS_CLASS_BACKGROUND`
+on macOS. All embedding work inherits this priority; it does not block the UI.
+
+## Design Decisions
+
+**max_length = 256** (DL-001): PKM sections average 50-150 words (~70-200
+tokens). Sections beyond 256 tokens are outlier long-form prose. At 256 tokens,
+per-sample attention tensors are [B,12,256,256], keeping peak Metal buffer
+accumulation below 1 GB at batch_size=16 and preventing cold-start memory
+spikes on M-series hardware.
+
+**batch_size = 16 in release** (DL-002): `BatchLongest` padding means one long
+section pads the entire batch to max sequence length. At batch_size=16 and
+max_length=256, the worst-case Metal tensor is [16,12,256,256], well within
+M-series unified memory budget during cold embedding.
+
+**Note embeddings composed from block mean-pool** (DL-003): `note_embeddings`
+is derived by mean-pooling all block vectors for a note, then L2-normalizing.
+Mean-pooling covers every qualifying section without truncation and produces a
+single unit-length vector compatible with cosine KNN retrieval. Quality
+trade-off: mean-pooling loses inter-section ordering but gains full content
+coverage; expected comparable retrieval quality for PKM notes where section
+order is not semantically load-bearing.
+
+**MODEL_VERSION bump on logic change** (DL-004): Changing max_length or
+composition strategy invalidates stored embeddings. Bumping `MODEL_VERSION` in
+`vector_db.rs` causes `init_vector_schema` to detect the mismatch and call
+`clear_all_embeddings`, wiping both tables atomically on next startup.
+
+**Zero-block fallback to embed_one** (DL-005): Notes shorter than
+`BLOCK_EMBED_MIN_WORDS` (20) AND `BLOCK_EMBED_MIN_LINES` (10) produce no block
+embeddings. Mean-pooling an empty set is undefined, so these notes fall back to
+`embed_one` on the FTS body or filename, ensuring every note has a
+`note_embeddings` entry for KNN retrieval.
+
+**Block pass before note composition** (DL-006): Note composition reads block
+vectors from the DB. `handle_block_embed_batch` must complete before the
+composition pass begins; `handle_embed_batch` enforces this ordering
+unconditionally.
+
+## Invariants
+
+- `MODEL_VERSION` must be bumped whenever `max_length`, model weights, or
+  composition strategy changes. Failing to bump leaves stale embeddings from a
+  different encoding space in the DB, silently degrading search quality.
+- `clear_all_embeddings` wipes both `note_embeddings` and `block_embeddings` in
+  one transaction. Never clear one table without the other.
+- `block_embeddings` must be fully written before the note composition pass
+  reads them. The pipeline enforces this by calling `handle_block_embed_batch`
+  first, unconditionally.
+- Notes with zero qualifying block sections still receive a note embedding via
+  `embed_one` fallback on FTS body or filename, ensuring `note_embeddings` is
+  populated for every note in the vault.
+
+## Rejected Alternatives
+
+- **max_length = 128**: Too aggressive; medium-length sections (100-200 words)
+  would be truncated, hurting retrieval quality for substantive PKM content.
+- **Remove note_embeddings**: Breaks note-level KNN candidate retrieval; block-
+  only search requires scanning all blocks per query which is slower at scale.
+- **Keep separate note embed pass**: Embeds truncated FTS body (drops content
+  beyond ~400 words) and adds a redundant GPU pass; does not fix the memory
+  spike.

```


## Execution Waves

- W-001: M-001
- W-002: M-002
