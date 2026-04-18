# Fix Block Embeddings: Bugs, Regressions, and Two-Tier Search

**Date:** 2026-04-08
**Branch:** `feat/block-embeddings`
**Status:** Implementation plan — pending approval

## Context

The `feat/block-embeddings` branch adds section-level embeddings (Step 11 from the unified roadmap). The review found 5 issues: a data-corruption bug (stale block embeddings on note edit), a tag extraction regression, two performance problems, and missing progress events. The user also wants a two-tier search design where note-level embeddings pre-filter candidates for block-level KNN.

---

## Task 1: Fix stale block embeddings on note edit

**Priority: HIGH — silent data corruption**

**Problem:** `handle_upsert` (service.rs:607) and `handle_upsert_with_content` (service.rs:623) call `vector_db::remove_embedding()` but never `vector_db::remove_block_embeddings()`. When a note is edited, `note_sections` is rebuilt but old block embeddings persist with stale heading_ids.

**Files:**

- `src-tauri/src/features/search/service.rs` — add `remove_block_embeddings` call in both handlers

**Changes:**

- After `let _ = vector_db::remove_embedding(conn, note_id);` on lines 607 and 623, add:
  ```rust
  let _ = vector_db::remove_block_embeddings(conn, note_id);
  ```

**Tests (in `vector_db.rs` `#[cfg(test)]`):**

- `upsert_block_embedding_overwrite_then_remove`: insert blocks with heading_ids A+B, remove all for path, insert A+C, verify only A+C remain

---

## Task 2: Restore tag hash-stripping in extract_tags

**Priority: MEDIUM — breaks shared_tag smart link rule**

**Problem:** Three `.trim_start_matches('#')` calls were accidentally removed during formatting cleanup. Frontmatter `tags: ["#meeting"]` now stores as `#meeting`, while inline `#meeting` stores as `meeting`. The `shared_tag` rule does exact string match — these won't match.

**File:** `src-tauri/src/features/search/db.rs`

**Changes:** Restore `.trim_start_matches('#')` at three locations:

1. Line 511 (inline array branch): append `.trim_start_matches('#')` after final `.trim()`
2. Line 523 (single-value branch): same
3. Line 536 (YAML list branch): same

**Tests (in `db.rs` `#[cfg(test)]`):**

- `extract_tags_strips_hash_from_frontmatter_inline_array`: input `tags: ["#meeting", "#project"]` → `["meeting", "project"]`
- `extract_tags_strips_hash_from_frontmatter_yaml_list`: input `tags:\n  - "#tagged"\n  - plain` → `["tagged", "plain"]`
- `extract_tags_strips_hash_from_frontmatter_single`: input `tags: "#solo"` → `["solo"]`

---

## Task 3: Single-pass block KNN + two-tier pre-filter

**Priority: MEDIUM — performance**

**Problem:** `query_block_semantic_similarity` (rules.rs:268) runs one full-table-scan KNN per source block = O(N_source × M_total). Two-tier design: use note-level KNN to find top-K candidate notes, then load block embeddings only for those candidates.

**Files:**

- `src-tauri/src/features/search/vector_db.rs` — make `dot_distance` and `bytes_to_floats` `pub(crate)`
- `src-tauri/src/features/smart_links/rules.rs` — rewrite `query_block_semantic_similarity`

**Algorithm:**

1. Get source note's block embeddings via `get_block_embeddings_for_note`
2. Get source note's note-level embedding via `get_embedding`
3. Run note-level `knn_search` → top 50 candidate notes
4. For each candidate, load its block embeddings via `get_block_embeddings_for_note`
5. Compute pairwise distances (source blocks × candidate blocks), keep best per target path
6. **Fallback:** if no note-level embedding exists, fall back to single-pass full scan (load all via SQL `WHERE path != ?1`)

**Complexity:** 10 source sections × 50 candidates × 5 avg sections = 2,500 comparisons vs 50,000 before.

**Changes to `vector_db.rs`:**

- `fn dot_distance` (line 440) → `pub(crate) fn dot_distance`
- `fn bytes_to_floats` (line 456) → `pub(crate) fn bytes_to_floats`

**Changes to `rules.rs` — `query_block_semantic_similarity`:**

```rust
fn query_block_semantic_similarity(conn, note_path) {
    let source_blocks = get_block_embeddings_for_note(conn, note_path);
    if source_blocks.is_empty() { return Ok(vec![]); }

    // Two-tier: note-level pre-filter
    let candidate_paths = match get_embedding(conn, note_path) {
        Some(note_vec) => {
            knn_search(conn, &note_vec, 50)?
                .into_iter()
                .filter(|(p, _)| p != note_path)
                .map(|(p, _)| p)
                .collect::<Vec<_>>()
        }
        None => {
            // Fallback: full scan (load all block embeddings excluding self)
            // ... single-pass approach
        }
    };

    // Block-level search within candidates only
    let mut best_by_path: HashMap<String, f64> = HashMap::new();
    for candidate_path in &candidate_paths {
        let target_blocks = get_block_embeddings_for_note(conn, candidate_path);
        for (_, target_vec) in &target_blocks {
            for (_, source_vec) in &source_blocks {
                let sim = (1.0 - dot_distance(source_vec, target_vec)) as f64;
                if sim > 0.0 {
                    let entry = best_by_path.entry(candidate_path.clone()).or_insert(0.0);
                    if sim > *entry { *entry = sim; }
                }
            }
        }
    }
    // Build RuleHit vec, sort, truncate to 50
}
```

**Tests (in `rules.rs` or `vector_db.rs` `#[cfg(test)]`):**

- `two_tier_block_search_finds_similar`: create note+block embeddings for 3 notes, verify block-level matches from note-level candidates
- `two_tier_block_search_excludes_self`: source note never appears in results
- `two_tier_fallback_when_no_note_embedding`: returns results even without note-level embedding

---

## Task 4: Cache get_fts_body per note in handle_block_embed_batch

**Priority: LOW — performance**

**File:** `src-tauri/src/features/search/service.rs`

**Change:** Add `HashMap<String, Option<String>>` cache before the chunk loop (line 1137). Replace `get_fts_body(conn, path)` call with cache lookup:

```rust
let mut fts_cache: HashMap<String, Option<String>> = HashMap::new();
// ...inside loop:
let body = match fts_cache
    .entry(path.to_string())
    .or_insert_with(|| search_db::get_fts_body(conn, path))
{
    Some(b) => b.clone(),
    None => continue,
};
```

No new tests needed — pure perf optimization, existing tests cover correctness.

---

## Task 5: Emit progress events for block embedding

**Priority: LOW — UX polish**

**File:** `src-tauri/src/features/search/service.rs`

**Changes:**

1. Add variants to `EmbeddingProgressEvent` (line 56):
   ```rust
   BlockStarted { vault_id: String, total: usize },
   BlockProgress { vault_id: String, embedded: usize, total: usize },
   BlockCompleted { vault_id: String, embedded: usize },
   ```
2. Thread `app_handle: &AppHandle` into `handle_block_embed_batch` signature
3. Update call site at line 1082
4. Emit `BlockStarted` after computing `needing.len()`, `BlockProgress` after each batch, `BlockCompleted` at end

**Frontend:** Update TS type for `EmbeddingProgressEvent` in the search ports/adapter (auto-generated via specta, may just need a frontend rebuild). Verify the embedding sync reactor handles or ignores the new variants gracefully.

---

## Verification

After each task, run:

```bash
cd src-tauri && cargo check && cargo test
pnpm check && pnpm lint && pnpm test
```

End-to-end:

1. Open a vault with existing note+block embeddings
2. Edit a note (change heading text) → verify old block embeddings are cleaned and re-embedded on next sync
3. Add frontmatter `tags: ["#test"]` → verify tag stored as `test` (without `#`)
4. Check smart link suggestions include block-level matches with reasonable performance
5. Monitor embedding progress UI during a full rebuild
