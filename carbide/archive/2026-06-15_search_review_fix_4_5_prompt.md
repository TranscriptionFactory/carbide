> 🔴 **URGENT** — contains a HIGH-severity correctness bug (#4: model-version
> upgrade can permanently leave a vault half-embedded). Pick up before lower-pri
> search work.
>
> **Created:** 2026-06-15 · **Status:** not started
> **Source review:** [`2026-06-15_vault_indexing_embedding_review.md`](./2026-06-15_vault_indexing_embedding_review.md)
> **Scope:** review items #4 (HIGH) and #5 (LOW), both in the indexing/save path.

---

# Scoping prompt — search review items #4 & #5

Scope and implement fixes for review items **#4** and **#5** in the Carbide
search code. Full context: `carbide/implementation/2026-06-15_vault_indexing_embedding_review.md`.
All code under `src-tauri/src/features/search/` (primarily `service.rs`).
**Locate everything by symbol — line numbers in the doc are stale** (the #2 and
#7 fixes already shifted `service.rs`).

## Item #4 [HIGH] — cancelled model-version upgrade commits the new version but only partially re-embeds

`handle_embed_batch` clears all embeddings, calls `set_model_version(new)`
*before* the re-embed pass, then embeds. On cancel or process shutdown mid-pass,
`get_model_version` already reports the new model but many notes have no
embedding — and `embed_sync` won't repair them because it skips anything already
in `already_embedded`. The vault is left silently half-embedded under the new
model, permanently.

**This needs a short plan before code — it is NOT a clean one-line move.** The
version field doubles as the change-detection trigger. Deferring `set_model_version`
to the end interacts with resume/cancellation semantics. Investigate and write a
brief plan block (top of your work or appended to the review doc) answering:

  - Trace the version-change detection: what reads `get_model_version` and
    decides to `clear()` + re-embed? Find the cancellation mechanism
    (cancel token / `is_embedding` / `embed_queued` atomic / shutdown path) and
    confirm exactly where a partial pass can be interrupted.
  - If the version is committed only after a fully uncancelled pass: on the next
    start the change is re-detected → `clear()` + restart from scratch. Confirm
    that is correct (it is, vs. today's silent corruption) and that it converges
    — i.e. a graceful (non-crash) cancel must not also leave the version stale
    *and* the embeddings cleared with no scheduled resume. Decide whether you
    need a two-phase marker (pending vs committed version, or an
    `embed_complete` flag) or whether deferring the single `set_model_version`
    call to the post-pass success branch suffices.
  - Define what "fully uncancelled pass" means precisely: all notes embedded AND
    not cancelled. Where is that success point?

Then confirm the approach in the plan before implementing. Prefer the simplest
fix that makes the invariant **"committed model version ⇒ every note is embedded
under that version"** hold across both graceful cancel and hard crash.

## Item #5 [LOW] — SQLite/HNSW divergence on dropped errors

Several sites do `let _ = upsert_embedding(...)` then unconditionally
`ni.insert(...)` (in `embed_note_on_save`, `handle_embed_batch`, and the block
paths — grep `upsert_embedding`, `upsert_block_embedding`, and `.insert(` /
`.write()` on the note/block index). Two problems:
  - If the DB write fails, the index gets a vector SQLite doesn't have →
    divergence with no log.
  - Poisoned `.write()` locks are silently swallowed (`if let Ok(...)`), so the
    index can miss a write that already landed in the DB.

**Fix:** make SQLite the source of truth — only insert into the index when the DB
write succeeded; `log::error!` on DB failure and on a poisoned lock. The four+
sites are near-identical; consider extracting one small helper
(`persist_note_embedding` / `persist_block_embedding`: write DB → on Ok, write
index; log + propagate/skip on Err) and routing all sites through it, rather than
hand-editing each. Keep it surgical — don't change the surrounding embed-loop
control flow.

This one is mechanical; no separate plan needed beyond noting the chosen helper
shape in the commit message.

## Tests (BDD, in the existing `service.rs` / `vector_db.rs` test modules)

  - #4: simulate a cancelled/interrupted re-embed pass and assert the committed
    model version is NOT advanced while notes remain unembedded; assert a
    subsequent `embed_sync` (or restart) fully re-embeds under the new model.
    Drive cancellation through whatever token/flag the code already exposes —
    don't add test-only hooks unless unavoidable, and if you must, keep them
    minimal and behind `#[cfg(test)]`.
  - #5: assert that a failing `upsert_embedding` leaves the index WITHOUT the
    vector (no divergence) and that the failure is surfaced (returns Err / logs).
    Use a Connection that forces the write to fail (e.g. drop/rename the table,
    or a read-only conn) to exercise the error branch.

## Constraints

  - Match existing style; **do NOT run workspace `cargo fmt`** (branch isn't
    rustfmt-clean — it churns ~34 unrelated files). Surgical diffs only.
  - Gates after each item: `cd src-tauri && cargo check`, then
    `cargo test --lib features::search`. The repo wraps cargo in `rtk` which
    summarizes output — use `rtk proxy cargo test ...` to see individual test
    names/failures.
  - Commit #4 and #5 **separately**. Update the Fix-status checklist in the
    review doc as each lands.

## Deliverable

A short plan for #4 (investigation output + chosen approach), then the two
implementations with tests, each committed separately, with the review doc's
Fix-status updated.

---

## Reviewer notes (read before running)

- **#4 is the one with teeth.** The tempting "just move `set_model_version` to
  the end" can strand a vault if a *graceful* cancel clears embeddings but leaves
  nothing scheduled to resume — the plan step exists to force that question. The
  real invariant to protect is *committed-version ⇒ fully-embedded*, across both
  crash and clean-cancel.
- **#5 risks scope creep into #4's territory** since they touch the same loops.
  Keep #5 to "DB-first, log on failure" — don't let it start rewriting the embed
  loop's control flow; that's #4's job.
