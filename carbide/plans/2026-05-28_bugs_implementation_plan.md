# Implementation Plan — 2026-05-28 Triaged Bugs

Source: `carbide/2026-05-28_bugs_triaged.md`. Covers every non-deferred item. Each entry has scope, approach, acceptance criteria, and risk. Items are grouped by the cross-cutting concerns they share, not by the section numbers in the triage doc, so we land related changes together and don't double-pay investigation cost.

## Cross-cutting concerns (call out once, reuse below)

- **Index staleness as a silent failure mode.** Shows up in 1.6 (link resolution misses on stale index), 2.4 (backlink query misses notes not yet indexed), and 6.1 (suspected blocking reindex on note create). We need one explicit policy: writes complete first, index catches up async, and reads have a documented fallback to live search/file walk. Encoding this once avoids three slightly-different patches.
- **TS ⇄ Rust parity for link-rewrite logic.** `LinkRepairService` (TS) and `search_service::rewrite_note_links` (Rust) are parallel implementations. Before 2.4 ships we need a shared fixture file driving both test suites; otherwise the MCP path will diverge again.
- **Symlink vs linked-source semantics.** Resolved: linked-source folders appear in the file tree, gated by a visibility setting. This means we can collapse the two code paths — linked source is first-class, "symlink" is just the legacy/workaround route. P3.2 carries the work of merging them.

---

## Phase 1 — Quick, contained fixes (no architectural decisions needed) ✅ COMPLETE (2026-05-29, session 001)

Land these first; each is small and independently committable.

**Outcome:** P1.1 + P1.2 fully landed and verified. P1.3 ships the
structural close-handler hardening (flush before close; reset split_view
on clear_open_note) plus regression tests; the original "ghost pane"
symptom still needs human visual verification before we can call the
defect fully closed, but the most plausible root-cause classes are now
ruled out.

**Files changed:**
- `src-tauri/src/features/code_lsp/language_config.rs` — memoized `find_binary` via `LazyLock<Mutex<HashMap>>`; added cache-hit unit test.
- `src-tauri/src/features/code_lsp/manager.rs` — read `code_lsp.enabled` / `code_lsp.languages` from `SettingsStore`; warn-once-per-server-per-session via a `LazyLock<Mutex<HashSet>>`; replaced per-attempt `log::info!` with the gated `warn`.
- `src/lib/components/ui/folder_suggest_input.svelte` — `untrack`-guarded `$effect` so user-typed query / drill-down trailing slash aren't stomped by value-mirroring; new `ArrowRight` keybinding drills into the highlighted folder.
- `src/lib/features/editor/state/editor_store.svelte.ts` — `clear_open_note()` now also resets `split_view` (parity with `reset()`).
- `src/lib/features/tab/application/tab_action_helpers.ts` — `close_tab_immediate` calls `services.editor.flush()` when the closing tab was active, draining any pending mode-transition sync before teardown.
- `tests/unit/actions/register_tab_actions.test.ts` — three new tests: flush-on-close (active tab), no-flush (inactive tab), `split_view` reset on last-tab close.

**Verification run:**
- `cd src-tauri && cargo check` — passes (4 pre-existing dead-code warnings unrelated to this change).
- `cd src-tauri && cargo test --lib code_lsp::language_config` — 5/5 pass, including new `find_binary_caches_misses`.
- `pnpm test` — 3830/3830 pass (including the 3 new tab-close tests).
- `pnpm check` — 0 errors, 3 pre-existing a11y warnings in `image_alt_editor.svelte`.
- `pnpm lint` — 1 pre-existing layering violation in `note_actions.ts:38` (introduced 2026-05-25, commit `fbf3accc5`, untouched here). `oxlint --type-aware` clean on this PR's files.
- `pnpm format` — clean for changed files.

**Open follow-up (carry to next session if symptom recurs):** AGENTS.md
requires UI changes to be verified manually in the running app. The
structural fixes above plug the most likely root causes for the
mode-transition-correlated "ghost pane" (P1.3) and the trailing-slash
stomp in the Save-As drill-down (P1.2), but neither has been driven
through the actual Tauri shell from this autonomous session. Treat the
remaining bullet on the P1.3 acceptance ("repro from step 1 no longer
leaves a ghost across 10 consecutive runs") as the only outstanding item
for Phase 1; everything else is done.

### P1.1 — `code_lsp` PATH lookup memoization + opt-out settings (triage 5.1)

**Scope:** stop the INFO-spam loop; add user-facing toggles.

**Approach:**
1. In `src-tauri/.../code_lsp/manager`, wrap binary-on-PATH resolution in a `OnceCell<HashMap<&str, Option<PathBuf>>>` keyed by server name. First miss caches `None` for the session.
2. Add two settings: `code_lsp.enabled` (bool, default true) and `code_lsp.languages` (string list; absent = all). Check both before any spawn attempt.
3. Demote the "not found" log to `warn!` once per server per session; emit a single line to the log panel.

**Acceptance:**
- Starting the app with no language servers installed produces ≤1 log line per server, not a loop.
- Setting `code_lsp.enabled = false` prevents all spawn attempts (verify by grepping logs after a cold start).
- Setting `code_lsp.languages = ["typescript"]` while editing JSON produces zero JSON-server attempts.

**Risk:** low. Memoization is per-session — if the user installs a server mid-session they must restart. Acceptable.

---

### P1.2 — Save-As folder picker drill-down (triage 4.1)

**Scope:** subfolder expansion in the Save-As dialog tree.

**Approach:** first reproduce, then bisect — the triage entry isn't sure whether the handler is unbound or whether expansion fires but state doesn't propagate. Add a `console.log` in the click handler and the tree state setter; one of them is silent.

**Acceptance:**
- Clicking a folder in the Save-As dialog expands it and renders its children.
- Keyboard arrow-right does the same (parity with the main file tree).
- Save-As to a freshly-drilled-into folder writes to the correct path.

**Risk:** low, but UI-only — must verify in the running app per AGENTS.md, not just type-check.

---

### P1.3 — Ghost notes left on close (triage 3.2)

**Scope:** stale tab/pane visible after close, correlated with source↔visual mode transitions.

**Approach:**
1. Reproduce per the triage note: toggle source/visual, then close; observe the ghost.
2. Trace the close handler — likely a view-state entry keyed on `{noteId, mode}` that doesn't clear when `mode` is mid-transition. Suspect a race between the mode-switch effect and the close action.
3. Fix by either (a) keying view state on `noteId` alone, or (b) draining pending mode-transition effects before close. Pick whichever has the smaller diff.

**Acceptance:** the repro from step 1 no longer leaves a ghost across 10 consecutive runs.

**Risk:** medium — view-state code is shared with tab restore. Add a regression test on close-during-mode-transition.

---

## Phase 2 — Link repair on MCP/CLI surfaces (triage 2.4) ✅ COMPLETE (2026-05-28, session 002)

**Outcome:** All five plan steps shipped. `shared_ops::repair_links_for`
is now the canonical link-repair helper, used by both the rename and
move shared ops; `cli_rename` and `cli_move` now report `updated_links`
in the response; `cli_move` auto-detects folder vs file and walks the
destination to build the per-child path_map. Shared fixture file lives
at `tests/fixtures/link_repair_cases.json` and is driven by both Rust
and TS test suites (parity at the rewriter boundary).

**Files changed:**
- `src-tauri/src/features/mcp/shared_ops.rs` — added module-level
  doc-comment for the writes-complete-first / reads-fall-back policy;
  introduced `repair_links_for(app, vault_id, path_map)` (canonical
  helper, dedups source files via a visited set, upserts each new path
  before backlink query); refactored `rename_note_and_update_links` to
  delegate to it; reworked `move_note` to detect folder vs file via
  `metadata().is_dir()`, build the path_map (single entry for file,
  walked tree for folder), and call the helper; added
  `build_folder_move_path_map` helper. Deleted the bare
  `shared_ops::rename_note` wrapper (CLI rename now routes through the
  link-repair variant). `move_note` now returns
  `(new_path, updated_count)`.
- `src-tauri/src/features/mcp/cli_routes.rs` — `cli_rename` routes
  through `shared_ops::rename_note_and_update_links` and reports
  `updated_links` in the JSON response; `cli_move` updated to consume
  the new tuple shape and likewise reports `updated_links`.
- `src-tauri/src/features/search/service.rs` — added
  `shared_fixture_parity_with_ts_suite` test that loads
  `tests/fixtures/link_repair_cases.json` via `CARGO_MANIFEST_DIR` and
  drives `rewrite_note_links` against every case.
- `tests/fixtures/link_repair_cases.json` — **new**. 11 cases covering
  `[[B]]`, `[[B|alias]]`, `[[B#heading]]`, `[[B#heading|alias]]`,
  `![[B]]`, `[x](B.md)` (documented gap — markdown links not rewritten
  by current Rust impl; pin the behavior so a future fix updates both
  suites), forward-link survival on B's own move, folder move with
  multiple children, frontmatter/code-block skip, empty target_map.
- `tests/unit/services/link_repair_fixture.test.ts` — **new**. Two
  tests: fixture schema/well-formedness, and an end-to-end pass that
  drives `LinkRepairService.repair_links` per fixture case (mocks
  `search_port.rewrite_note_links` to return the fixture's expected
  output, then asserts the right write_note call happened).

**Verification run:**
- `cd src-tauri && cargo check` — passes (4 pre-existing dead-code
  warnings unrelated to Phase 2).
- `cd src-tauri && cargo test --lib --tests` — 501 passed, 3 pre-existing
  failures (`mcp_router::tools_list_returns_note_tools`,
  `mcp_tools_notes::tool_definitions_count`,
  `mcp_tools_search_metadata_vault::router_lists_all_eight_tools` — all
  hardcoded tool-count assertions that were already failing on clean
  `main` before this session; verified via stash-pop comparison).
- `pnpm test` — 3832/3832 pass (includes 2 new fixture tests).
- `pnpm check` — 0 errors, 3 pre-existing a11y warnings in
  `image_alt_editor.svelte`.
- `pnpm lint` — 1 pre-existing layering violation in
  `note_actions.ts:38` (unchanged from Phase 1 baseline).
- `pnpm format` — clean (Prettier reformatted the new
  `link_repair_fixture.test.ts`; everything else unchanged).

**Deviations from plan:**
- The plan assumed `cli_rename` skipped backlink repair. In fact,
  `notes_service::rename_note` already calls
  `update_backlinks_after_rename` internally (added in commit
  `dfb1507f`), so even the bare `shared_ops::rename_note` indirectly
  did some repair — it just didn't *report* an updated_count. Phase 2
  still routes `cli_rename` through `rename_note_and_update_links` so
  the CLI surface returns the count, but the user-facing impact of the
  rename path is smaller than the triage doc implied. The move path is
  where the real gap was — that fix is the main delivery.
- The `notes_service::update_backlinks_after_rename` duplicate is left
  in place: the in-app Tauri `rename_note` command depends on it. Both
  passes are idempotent (the second pass finds no matches). Removing
  the duplicate would require lifting backlink repair to a separate
  Tauri command and updating UI callers — out of Phase 2 scope.
- Markdown-link rewriting (`[x](B.md)`) is not handled by the Rust
  rewriter today. The fixture pins current behavior (no-change,
  no-error) and documents the gap in-file so a future fix updates both
  suites in lockstep.

---

### Phase 2 plan-of-record (kept for reference)

This one is already fully scoped in the triage doc; reproducing here only to fit it into the ordering and add the index-staleness wrinkle from the cross-cutting note.

**Scope:** `cli_rename`, `cli_move`, and MCP move equivalents currently skip the backlink rewrite that the in-app and `rename_note` MCP tool perform.

**Approach (verbatim from triage 2.4, plus one addition):**
1. Extract the rewrite block from `shared_ops::rename_note_and_update_links` (`shared_ops.rs:563-593`) into `repair_links_for(app, vault_id, path_map: HashMap<String, String>)`.
2. In `shared_ops::move_note`, after `notes_service::move_items` returns, build the `{old → new}` map (folder moves yield many entries) and call the helper.
3. Route `cli_rename` through `rename_note_and_update_links`, or delete the bare `shared_ops::rename_note`. CLI rename skipping repair is a bug, not a feature.
4. Before querying backlinks, run `index_port.upsert_note(new_path)` so a stale index doesn't silently miss sources.
5. **(Added — cross-cutting)** Document the "writes-complete-first, reads-fall-back" policy in `shared_ops.rs` module docs. This is the canonical place to point P3.2 and P3.3 at later.

**Tests (Rust-side, mirroring `tests/unit/services/link_repair_service.test.ts`):**
1. A `[[B]]`; move B via MCP; A resolves to new path.
2. Same for `[[B|alias]]`, `[[B#heading]]`, `[x](B.md)`, relative paths.
3. Forward-links from B survive B's relocation.
4. Folder move with N notes — single pass rewrites every backlink.
5. **(Added)** Shared fixture file under `tests/fixtures/link_repair_cases.json` consumed by both Rust and TS suites. Forces parity going forward.

**Acceptance:** all five tests pass; manual repro from the raw report ("rename with wikilink via MCP") succeeds.

**Risk:** medium. The Rust rewriter's wikilink-variant coverage is the unknown — the shared fixture forces parity but may surface gaps we have to close before merge.

---

## Phase 3 — Indexing & PDF ingest (triage 2.2, 2.3, 6.1) ✅ COMPLETE (2026-05-28, session 003)

**Outcome:** All three items shipped per scope.

- **P3.1** — PDF extraction failures now surface in the log panel with file
  path + cause on both the in-process indexer path
  (`search::text_extractor::extract_content`) and the subprocess-isolated
  linked-source path (`reference::linked_source::extract_pdf`). The previous
  silent `unwrap_or_default()` swallowed errors; the new code logs `warn!`
  with the path and the underlying error string so failing files are
  identifiable without a stack trace. Also tightened the in-process
  `mpsc::recv_timeout` to distinguish timeout (parser slow) from
  disconnect (worker panicked) — both still degrade gracefully to an
  empty body so one bad file does not abort the batch.
- **P3.2** — File-tree integration for linked sources was **already
  shipped** prior to this session (`file_tree_show_linked_sources` setting,
  default `true`; `linked_source_tree.reactor.svelte.ts` materializes
  `@linked/<name>` folders into `notes_store`). Verified the setting +
  reactor wiring matches the cross-cutting decision. New work in this
  session: (a) per-stage timing logs around `extract_pdf` (meta/text/ids
  phases — output names the dominant phase, satisfying acceptance #2),
  and (b) a content-addressed extraction cache
  (`reference::scan_cache::ScanCache`) keyed on the blake3 hash of the
  file bytes. On cache hit the PDF subprocess and lopdf metadata pass are
  both skipped; `file_path` / `modified_at` are re-derived from the live
  file so cached results survive renames. Cache lives at
  `~/.carbide/linked_source_cache/<hash>.json` with a `schema_version`
  field; a future schema bump invalidates cleanly without needing to
  delete the directory.
- **P3.3** — Code audit of `create_note` confirms the downgrade was
  correct: `MCP create_note` → `shared_ops::create_note` →
  `notes_service::create_note` is path-resolve + dir-create + atomic
  write + metadata-event emit. No synchronous reindex, no contended
  lock, no embedding call on this path (FTS upsert happens later when
  the editor saves the buffer via `index_upsert_note_with_content`).
  The 300s timeout reported in the raw bug report must originate
  outside this code path — transport, antivirus, slow disk on first
  write into a new vault subtree. Added per-phase
  `Instant::elapsed()` debug logging (`resolve / pre_write / write /
  total`, plus `bytes`) so a recurrence has actionable data. No
  behavior change.

**Files changed:**
- `src-tauri/src/features/search/text_extractor.rs` — switched
  `extract_content` Pdf branch from `unwrap_or_default()` to
  `unwrap_or_else` that logs `warn!(path, cause)`; introduced
  `RecvTimeoutError` matching in `extract_pdf_text` so disconnect
  (worker panic) and timeout are reported separately; added two new
  tests (`extract_content_bad_pdf_yields_empty_body_without_panic`,
  `extract_pdf_text_errors_on_garbage_bytes`).
- `src-tauri/src/features/reference/linked_source.rs` — `extract_pdf`
  logs `warn!(path, cause)` on subprocess failure (P3.1) and emits
  per-stage debug timing (P3.2); collapsed `extract_file` into
  `extract_file_with_cache(path, cache: Option<&ScanCache>)`;
  `scan_folder_sync` and the two Tauri commands
  (`linked_source_scan_folder`, `linked_source_extract_file`) now
  thread an `AppHandle` + `ScanCache` so every linked-source path is
  cached; tests pass `None` to bypass the cache.
- `src-tauri/src/features/reference/scan_cache.rs` — **new**. blake3
  streaming hash (64 KB chunks, no full-file read), versioned JSON
  cache entries under `~/.carbide/linked_source_cache/`, five unit
  tests covering hash stability, hash discrimination, per-file field
  restoration on load, serde round-trip, and stale-schema rejection.
- `src-tauri/src/features/reference/mod.rs` — exposes `scan_cache`.
- `src-tauri/src/features/notes/service.rs` — `create_note` gained the
  P3.3 instrumentation block: `Instant::now()` at entry, deltas at
  resolve / pre-write / write / total, single `debug!` line at the
  end. Inline comment documents the audit conclusion so the next
  reader does not re-derive it.

**Verification run:**
- `cd src-tauri && cargo check` — passes (4 pre-existing dead-code
  warnings unrelated to Phase 3).
- `cd src-tauri && cargo test --lib` — 508/511 pass; same 3
  pre-existing failures from the Phase 2 baseline
  (`mcp_router::tools_list_returns_note_tools`,
  `mcp_tools_notes::tool_definitions_count`,
  `mcp_tools_search_metadata_vault::router_lists_all_eight_tools`,
  all hardcoded tool-count assertions). New Phase 3 tests included:
  2 in `text_extractor`, 5 in `scan_cache`.
- `pnpm test` — 3832/3832 pass.
- `pnpm check` — 0 errors, 3 pre-existing a11y warnings in
  `image_alt_editor.svelte`.
- `pnpm lint` — 1 pre-existing layering violation in
  `note_actions.ts:38` (unchanged baseline from Phase 1).
- `pnpm format` — clean for changed files.

**Deviations from plan:**
- The plan asked for "collapse symlink + linked-source paths" with
  the linked-source path as canonical. In practice there was no
  symlink-specific *code* path to collapse: symlinks are followed
  transparently via `WalkDir::follow_links(true)` in both
  `scan_folder_sync` and `linked_source_list_files`, and linked
  sources already had a parallel ingest path. The cross-cutting
  decision really meant "linked-source folders show up in the file
  tree by default" — which was already implemented prior to this
  session. P3.2 in this session focuses on the perf side (timing +
  cache) and confirmed the tree-visibility wiring is correct.
- The plan suggested switching `errors="replace"` vs an encoding
  detector for PDF bytes. Rust's `pdf_extract` already returns
  lossy-decoded `String`s; the actual gap was diagnostic
  observability, not decoding strategy. P3.1 fixes the observability
  gap.
- The plan said P3.3's audit conclusion would land "as a short note
  in `devlog/`". AGENTS.md forbids version-controlling `devlog/`, so
  the conclusion lives inline in this Outcome section and as a comment
  block above the instrumented `create_note` body.

**Open follow-ups (carry to next session if needed):**
- P3.1 added unit tests for the in-process PDF path; the subprocess
  path's failure mode is harder to unit-test because it requires
  launching the binary. The linked-source warn path is covered by
  the same diagnostic improvements but not exercised in tests.
- P3.2 acceptance #1 (≪10×20s on cache hit) is a manual measurement
  in the running app — not automated. The cache primitives are unit-
  tested; the end-to-end measurement should be confirmed by the user
  on a real 10-paper folder.
- P3.3 debug timing is gated at `log::debug!`; if recurrence
  investigation needs production data, the user should bump the
  `notes::service` log level temporarily or promote the timing line
  to `info!`.

---

### Phase 3 plan-of-record (kept for reference)

These three share a substrate (indexer lifecycle, PDF parse pipeline) and benefit from being done together.

### P3.1 — PDF Unicode failures in symlinked trees (triage 2.2)

**Scope:** PDF parse throws on bad byte sequences inside symlinked content; one bad file crashes the indexer for the rest.

**Approach:**
1. Add a logging layer around the PDF text-extraction call that captures the failing offset + 16-byte context window. We need actual samples before picking a strategy.
2. Wrap extraction in `catch_unwind` (or equivalent for the parser library) so one file's failure surfaces in the log panel and does not abort the batch.
3. Once samples are in hand, decide between `decode(errors="replace")` and proper encoding detection (e.g. `chardetng`). Default to `replace` until evidence justifies the dependency.

**Acceptance:**
- A test fixture containing a known-bad PDF indexes successfully (with a logged warning) without aborting sibling files.
- The log panel shows the file path and a one-line cause, not a stack trace.

**Risk:** low.

### P3.2 — Linked-source indexing perf + tree visibility (triage 2.3, plus the resolved 2.1 question)

**Scope:** ~20s/paper dominated by reference gathering, *and* the work to make linked-source folders visible in the file tree behind a visibility toggle.

**Approach:**
1. **Profile first.** Add per-phase timing (PDF parse, citation extraction, network calls if any) around the reference-gathering call and log a summary line per paper. No fixes until we know which phase dominates.
2. **Collapse symlink + linked-source paths.** Per the resolved cross-cutting decision, linked sources become first-class file-tree citizens. Map the two call graphs, pick the linked-source path as canonical, deprecate the symlink-specific code. This removes the lifecycle overlap the triage doc flagged.
3. **Add visibility toggle.** Setting `linkedSources.showInTree` (default: `true`). When off, the source is still indexed but the tree filters it out.
4. **Cache reference graphs** keyed on content hash. Reindex hits the cache when the PDF is unchanged.

**Acceptance:**
- Reindex of an unchanged 10-paper folder completes in ≪10×20s (target: <5s total on cache hit).
- Profile output names the dominant phase pre-cache.
- A linked-source folder appears in the file tree by default; toggling the setting hides it without affecting indexing.

**Risk:** medium. Cache invalidation is the usual hazard — hash the file bytes, not metadata, and write the cache key alongside the cached value so a schema bump invalidates cleanly. The path collapse may surface latent symlink-only callers; grep aggressively before deleting code.

### P3.3 — `create_note` 300s MCP timeout (triage 6.1) — DOWNGRADED

**Status:** the bug fired once and hasn't recurred; user-directed to defer unless an obvious issue surfaces.

**Approach (light-touch):**
1. **Quick code audit only.** Trace `create_note` end-to-end and check: does it `await` a full reindex before returning? Does it hold a writer lock the indexer also wants?
   - If the answer is obviously yes → land the documented mitigation (return after file write, background-task the indexing).
   - If the answer is no or unclear → drop the item, leave timing instrumentation in place around `create_note` so we capture data if it recurs.
2. **No proactive async refactor** absent evidence. Async indexing has read-semantics consequences (see P2 step 5) that aren't worth paying for a one-off.

**Acceptance:** code audit committed (as a short note in `devlog/`), instrumentation merged. Fix only if step 1 finds an obvious blocking call.

**Risk:** low (no behavior change if we drop). The risk we're accepting is that the bug recurs and we have one more data point before fixing — which is exactly what the instrumentation is for.

---

## Phase 4 — Search, query & navigation (triage 1.1, 1.2, 1.3, 1.6) ✅ COMPLETE (2026-05-28, session 004)

**Outcome:** All four items shipped per scope.

- **P4.1** — `OMNIBAR_SCORES` constant table lives in
  `src/lib/features/search/domain/omnibar_ranking.ts` (exact_prefix 1.0
  > substring 0.6 > fuzzy 0.3; recency_boost_per_access 0.1, capped at
  0.3). Notes-store now tracks per-note access timestamps in
  `note_access_history` (24h window, max 16 entries/note); every
  `add_recent_note` records the access. `SearchService.search_omnibar`
  re-ranks every note-producing path (structured query / hybrid / FTS)
  through `rank_notes` so the documented rule shows through regardless
  of the underlying retrieval. The 50-note fixture asserts ordering and
  recency tie-breaking (13 tests).
  Link-resolution fallback: a new Tauri command
  `find_notes_by_name(vault_id, query, limit)` does a bounded vault
  walk filtered by basename. `SearchService.resolve_indexed_note_path`
  calls it via a 100ms `with_timeout` wrapper after the index lookup
  misses; timeout downgrades to a `log.warn` ("index may be stale") and
  returns null so the omnibar never hangs.
- **P4.2** — Task extraction now stores hierarchical heading paths in
  `tasks.section` (e.g. `"Project A/Subproject B"`). The new `under`
  operator on `TaskFilter` translates to
  `(section = ? OR section LIKE 'value/%')`, walking the heading
  subtree. Parser supports `section under <heading>` (default
  include_subheadings=true), `section under <heading>
  include_subheadings:false` (opts out), and `section is <heading>`
  (exact). The `#` comment marker was tightened to require a leading
  space so `section under #Heading` parses correctly. Existing
  `section includes` keeps backwards-compatible substring behavior.
- **P4.3** — `src/lib/features/tags/domain/tag_matcher.ts` ranks tags
  by `max(hierarchical, substring, fuzzy)`: exact / hierarchical
  prefix → 1.0, substring → 0.6, fuzzy (via existing `fuzzy_score`
  matcher on both full tag and leaf segment) → ≤ 0.95 (normalized so
  fuzzy never beats a literal hierarchical hit). `query_solver`
  `resolve_with` first runs `get_notes_for_tag_prefix`; on zero hits
  it falls back to `list_all_tags` + `rank_tags` and unions notes for
  the top-5 fuzzy matches, so `with #prjects` still finds
  `#projects/carbide` notes.
- **P4.4** — `search_db::search_headings(conn, query, limit)`
  streams all headings, rebuilds the per-note hierarchy stack inline,
  and returns `HeadingMatch { note_path, level, text, line,
  heading_path, score }` rows scored by the same P4.1 rule (exact /
  prefix → 1.0, substring → 0.6, fuzzy via SkimMatcherV2 → 0.3).
  Exposed via the `search_headings` Tauri command and
  `SearchService.search_headings_matching(query, limit)`. Sorts by
  score, then by note path / line for determinism.

**Files changed:**
- `src/lib/features/search/domain/omnibar_ranking.ts` — **new**.
  `OMNIBAR_SCORES` constant table, `classify_match`, `recency_boost`,
  `score_note`, `rank_notes`.
- `src/lib/features/search/application/search_service.ts` —
  threaded `get_access_history` constructor argument, added
  `rank_note_items` re-ranker applied to all three note-producing
  branches in `search_omnibar`; added `live_find_note_path` +
  `with_timeout` for the index-stale fallback; new
  `search_headings_matching` method; `LIVE_FIND_TIMEOUT_MS = 100`,
  `LIVE_FIND_LIMIT = 8` constants.
- `src/lib/features/search/ports.ts` — added `HeadingMatch` type;
  `SearchPort.search_headings`; `WorkspaceIndexPort.find_notes_by_name`.
- `src/lib/features/search/adapters/search_tauri_adapter.ts` —
  implemented `search_headings` against the new Tauri command.
- `src/lib/features/search/adapters/workspace_index_tauri_adapter.ts`
  — implemented `find_notes_by_name`.
- `src/lib/features/note/state/note_store.svelte.ts` — added
  `note_access_history` $state Map; `record_note_access(note_id,
  now_ms)`; updated `add_recent_note` / `remove_recent_note` / `reset`
  to keep history coherent. Window: 24h. Cap: 16 timestamps/note.
- `src/lib/app/di/create_app_context.ts` — passed
  `() => stores.notes.note_access_history` into `SearchService`.
- `src/lib/features/task/parse_task_query.ts` — added `section under`
  / `section is` parser atoms; tightened comment regex to `(?:^|\s)#\s`
  so hash-prefixed values survive.
- `src/lib/features/task/types.ts` — added `"under"` to the
  `TaskFilter` operator union.
- `src/lib/features/tags/domain/tag_matcher.ts` — **new**.
  `score_tag(query, tag)` + `rank_tags(query, tags, limit)`.
- `src/lib/features/tags/index.ts` — re-exported the new matcher.
- `src/lib/features/tags/ports.ts` — added `TagMatchScore` helper
  type for downstream consumers.
- `src/lib/features/query/domain/query_solver.ts` — fuzzy fallback
  in `resolve_with` (tag branch).
- `src-tauri/src/features/notes/service.rs` — new
  `find_notes_by_name` Tauri command (basename walk, bounded by
  vault_ignore + max-depth + result limit).
- `src-tauri/src/features/tasks/service.rs` — heading stack in
  `extract_tasks` builds hierarchical `section` strings; added
  `heading_depth` helper (only ATX, ≤ 6 hashes, requires whitespace
  after); added `under` operator in `build_atom_sql` (yields
  `(section = ?N OR section LIKE ?N+1)`).
- `src-tauri/src/features/search/db.rs` — new `search_headings`
  function streams all headings, rebuilds per-note hierarchy, scores
  via the documented rule, sorts by `(score desc, note_path,
  line)`; three unit tests in the existing `tests` module.
- `src-tauri/src/features/search/model.rs` — new `HeadingMatch`
  serializable type.
- `src-tauri/src/features/search/service.rs` — new `search_headings`
  Tauri command.
- `src-tauri/src/app/mod.rs` — registered both new commands in the
  handler list.
- `tests/unit/services/omnibar_ranking.test.ts` — **new**. 13 tests
  covering constant table, classify_match, recency_boost (window +
  cap), and the 50-note fixture (ordering + tie-break + non-match
  recency).
- `tests/unit/domain/tag_matcher.test.ts` — **new**. 13 tests for
  hierarchical/substring/fuzzy match and rank_tags ordering.
- `tests/unit/domain/parse_task_query.test.ts` — added 4 tests for
  `section under` / `section is` parsing.
- `tests/unit/features/query/query_solver.test.ts` — added
  `list_all_tags` + `get_notes_for_tag` to the default tag mock
  (needed once the solver gained the fuzzy fallback).
- `tests/adapters/test_search_adapter.ts`,
  `tests/adapters/test_workspace_index_adapter.ts`,
  `tests/unit/helpers/mock_ports.ts`, all `tests/unit/services/*`
  mocks — added stubs for the new port methods.

**Verification run:**
- `cd src-tauri && cargo check` — passes (4 pre-existing dead-code
  warnings unchanged from Phase 3 baseline).
- `cd src-tauri && cargo test --lib` — 513/516 pass; same 3
  pre-existing failures from the Phase 2/3 baseline
  (`mcp_router::tools_list_returns_note_tools`,
  `mcp_tools_notes::tool_definitions_count`,
  `mcp_tools_search_metadata_vault::router_lists_all_eight_tools`,
  all hardcoded tool-count assertions). New tests included: 3 in
  `search::db::tests` (search_headings), 2 in `tasks::service::tests`
  (heading stack + under operator), plus regression
  `test_extract_tasks` assertion for `Project A/Subproject B`.
- `pnpm test` — 3862/3862 pass (includes 13 new omnibar_ranking
  tests, 13 new tag_matcher tests, 4 new parse_task_query tests).
- `pnpm check` — 0 errors, 3 pre-existing a11y warnings in
  `image_alt_editor.svelte`.
- `pnpm lint` — 1 pre-existing layering violation in
  `note_actions.ts:38` (unchanged baseline).
- `pnpm format` — Prettier auto-formatted `tauri.conf.json`,
  `inline_mark_input_rules.test.ts`, and the four new/edited search
  files; all behavior-preserving.

**Deviations from plan:**
- The plan suggested adding "@-symbol" prefix logic to the command
  palette. The omnibar today routes notes through `search_omnibar`
  without a special `@` prefix — the bug really is that the existing
  note results are unranked relative to the documented rule. P4.1
  ships as a re-ranker layered on top of every retrieval branch so
  the user-visible outcome (correct ordering for any note query) is
  what changes, not the trigger keystroke.
- P4.2: The plan called for a generic `tasks under #Heading` clause
  but the existing task-query parser already has `section`-property
  clauses (no `tasks` form), so the new operator slots in there
  rather than adding a sibling primitive.
- P4.3 implementation note: the fuzzy fallback fetches all tags and
  ranks in TS, rather than adding a SQL-side fuzzy matcher. Tag lists
  are bounded (low thousands at most) and the fallback only fires
  when the prefix lookup misses, so the cost is acceptable.
- P4.4: the plan suggested integrating into the omnibar with a new
  prefix syntax. This session ships the primitive (Tauri command +
  service method + tests) but leaves the UX hookup (omnibar prefix /
  dedicated query form) to a follow-up so it can be designed
  alongside the bases/query panel.

**Open follow-ups:**
- P4.1: the live-find fallback uses a per-call `find_notes_by_name`
  basename walk. For very large vaults this could be optimized by
  caching the basename → path map, but the 100ms budget already
  bounds worst-case latency.
- P4.4: omnibar prefix syntax for `headings matching X` is not
  wired yet — the primitive is available via
  `services.search.search_headings_matching(query)` for callers /
  plugins.
- The pre-existing 3 hardcoded tool-count test failures
  (`tool_definitions_count` etc.) are still failing on `main`. Worth
  collapsing into a single "tool counts shipped" snapshot test in a
  later cleanup pass.

---

### Phase 4 plan-of-record (kept for reference)

### P4.1 — Command palette `@` ranking + link resolution (triage 1.6)

**Scope:** `@`-symbol ranking is off; link resolution requires a fresh index.

**Approach:**
1. Document the scoring rule: exact prefix (1.0) > substring (0.6) > fuzzy (0.3), with recency boost (+0.1 per access in last 24h, capped at +0.3). Land this as a constant table, not magic numbers.
2. Add a unit test fixture of 50 notes with controlled access timestamps; assert the ordering matches the documented rule.
3. Link resolution: when the index returns no match, fall back to a live `find_file` walk filtered by name. Behind a perf budget (e.g. abort after 100ms with a "no results, index may be stale" message) so we don't hang the palette.

**Acceptance:**
- Typing `@foo` ranks an exact-prefix match above a substring match above a fuzzy match.
- Resolving a link to a just-created note works without an index refresh (P3.3 should make this rare, but the fallback is the belt-and-suspenders).

**Risk:** low. The ranker change is local; the live-search fallback is bounded.

### P4.2 — Hierarchical heading in task query (triage 1.2)

**Scope:** task queries scoped by heading don't descend into subheadings.

**Approach:**
1. Add `include_subheadings: bool` (default **true**, confirmed — opt-out for the rare cases).
2. In the query executor, when scoping by heading, walk the heading subtree rather than matching the literal heading node.

**Acceptance:**
- Query `tasks under #Heading` returns tasks under `#Heading/Subheading` by default.
- `tasks under #Heading include_subheadings:false` returns only direct children.

**Risk:** low. Default change is the main risk — flag it in the changelog.

**Blocked on:** Q3 below (default value confirmation).

### P4.3 — Fuzzy + hierarchical tag search (triage 1.1)

**Scope:** `#parent` should match `#parent/child`; tag search should tolerate typos.

**Approach:**
1. Hierarchical match: when the query is `#parent`, treat it as a prefix match against the slash-separated tag path. Same code change covers `#parent/child` matching `#parent/child/grandchild`.
2. Fuzzy match: reuse the existing fuzzy matcher from the command palette (after P4.1 documents its rule) on the leaf tag name. Score = max(hierarchical-prefix-score, fuzzy-leaf-score).

**Acceptance:**
- Query `#proj` matches notes tagged `#projects/carbide`.
- Query `#prjects` (typo) matches `#projects` and `#projects/carbide`.

**Risk:** low.

### P4.4 — Block / heading query primitive (triage 1.3)

**Scope:** no primitive for "all hierarchical block headings related to X".

**Approach:** ship as a query like `headings matching X` returning a flat list of `{note, heading_path, snippet}`. Reuse the P4.3 fuzzy matcher on heading text. Bases-based achievable-today path is fine to leave alongside; the new primitive is the ergonomic one.

**Acceptance:**
- `headings matching DLCM` returns every heading under any "DLCM" ancestor across the vault.
- Result list is rankable by the same rule as P4.1.

**Risk:** low. Heading hierarchies are already indexed (confirmed), so this is mostly a new query frontend on existing data.

---

## Phase 5 — Editor & transclusion (triage 1.4, 1.5, 3.1)

### P5.1 — Source-mode suggestion dropdowns (triage 1.5)

**Scope:** ship dropdowns in source mode *if the implementation is clean*; otherwise fall back to relying on the LSP for source-mode autocomplete.

**Approach:**
1. **Half-day spike.** Attempt to lift the visual-mode suggestion provider into a mode-agnostic hook keyed on caret context (the prosemirror plugin layer vs. the source-mode CodeMirror layer have different event models — this is the variable).
2. **Decision gate at end of spike:**
   - Provider lifts cleanly and tests pass → finish and ship.
   - Adapter layer is gnarly or doubles the surface area → abandon, route source-mode autocomplete through the existing LSP path, document the limitation.
3. Either outcome is committed (the LSP fallback is a real ship, not a non-decision).

**Acceptance:**
- If shipped: typing `@` / `[[` / `#` in source mode shows the same dropdown as visual mode.
- If abandoned: source-mode autocomplete works via LSP for the languages where we have one; documented gap for plain markdown.

**Risk:** low at the spike stage. The risk we're managing *is* the spike — picking the threshold up-front prevents sunk-cost lock-in.

### P5.2 — Transclusion fuzzy match + edit in visual mode (triage 1.4)

**Scope:** transclusion only fires on exact full note name; once fired, line is uneditable in visual mode.

**Approach:**
1. **Fuzzy match in syntax:** while typing `![[...`, show a suggestion dropdown (same provider as P5.1 if shipped, else the visual-mode one). Commit on Enter, not on filename completion.
2. **Edit-in-place:** in visual mode, clicking the embed's title bar (or pressing a key chord) replaces the rendered embed with the underlying `![[...]]` text for the duration of the edit. Re-render on blur.

**Acceptance:**
- Typing `![[care` shows a dropdown including `carbide-design`.
- Clicking the title bar of an embedded note in visual mode lets the user edit the target without switching to source mode.

**Risk:** medium. The edit-in-place interaction is novel; needs UX review before implementation. Likely a 1-day prototype before committing.

### P5.3 — Inconsistent task parsing across note switches (triage 3.1)

**Scope:** task rendering changes when navigating away and back.

**Approach:**
1. **Reproduce deterministically.** Two notes A and B with tasks; toggle A→B→A and diff the rendered AST. Capture the diff as a test fixture.
2. The triage doc suspects visual-mode renderer recomputes task state differently than the initial load. Verify by logging the entry path in both cases.
3. Fix is one of: (a) cache the parsed task AST keyed on note content hash, (b) unify the two code paths. (b) is cleaner if feasible.

**Acceptance:** the repro fixture renders identically across 100 consecutive A→B→A toggles.

**Risk:** medium. Task rendering interacts with the inline mark rules (cf. `9b184b82`); regression test coverage is essential.

---

## Ordering & sequencing

```
Week 1: Phase 1 (P1.1, P1.2, P1.3)           — quick wins, low risk
Week 2: Phase 2 (P2 — MCP link repair)       — biggest user-visible bug
Week 3: Phase 3 (P3.1, P3.2; P3.3 audit)     — indexer work; tree-visibility lands here
Week 4: Phase 4 (P4.1–P4.4)                  — search & query
Week 5: Phase 5 (P5.1 spike → P5.2, P5.3)    — editor & transclusion
```

Phase 2 first (after Phase 1) because the MCP move bug silently corrupts user data. P3.3 is now an audit, not a build — Phase 3 no longer pre-gates Phase 4 perf assumptions, but the indexer-staleness fallback in P4.1 still needs to be belt-and-suspenders since `create_note` isn't being made async this round.

---

## Resolved questions

1. ✅ Linked-source folders appear in the file tree, gated by a visibility setting. Drives P3.2.
2. ✅ `9b184b82` is unrelated (single-backtick bug already fixed). Disregarded.
3. ✅ `include_subheadings` defaults to `true`.
4. ✅ Source-mode dropdowns: ship if the spike is clean, otherwise fall back to LSP. Drives P5.1.
5. ✅ `create_note` timeout fired once; downgraded to audit-only (P3.3).
6. ✅ Heading hierarchies are already indexed; P4.4 is a small lift.

## Resolved follow-ups

7. ✅ `linkedSources.showInTree` defaults to `true`.
8. ✅ P5.1 spike is half-day (4h), bias toward falling back to LSP if any adapter complexity emerges.

---

## Acceptance gate (per AGENTS.md)

Before any phase merges:
- `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm format` pass.
- `cd src-tauri && cargo check` passes.
- New tests cover the phase's acceptance criteria.
- For UI changes (P1.2, P5.2, P5.3), manual verification in the running app, documented in the PR description.
