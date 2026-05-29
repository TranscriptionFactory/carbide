# Agent Run Handoff: 2026-05-28_bugs

Plan: /Users/abir/src/carbide/carbide/plans/2026-05-28_bugs_implementation_plan.md

## Current state

Session 001 (2026-05-29 UTC) completed **Phase 1** — P1.1, P1.2, and
P1.3. See plan §"Phase 1" for the recorded outcome, file list, and
verification details. The next session should pick up **Phase 2 — Link
repair on MCP/CLI surfaces (triage 2.4)**.

## What landed in Phase 1

- **P1.1 (`code_lsp`):** memoized PATH binary lookup via
  `LazyLock<Mutex<HashMap>>` in `language_config.rs`; gated spawn on
  `code_lsp.enabled` (default true) and `code_lsp.languages` (allowlist;
  absent = all) via `SettingsStore` in `manager.rs`; warn-once-per-server
  replaces the per-attempt INFO log.
- **P1.2 (Save-As folder picker):** the dialog uses
  `FolderSuggestInput` (autocomplete dropdown, not a tree — triage word
  "tree" was loose). The drill-down was being stomped by the
  value→query `$effect` mirroring; fixed by reading `query` through
  `untrack(...)` and comparing trim-equal to `value`. Added an
  `ArrowRight` keybinding that commits the highlighted folder so
  keyboard navigation matches tree-style drill-in.
- **P1.3 (Ghost panes):** added `services.editor.flush()` at the top of
  `close_tab_immediate` when the closing tab is active, and made
  `clear_open_note()` also reset `split_view` (it already reset
  `editor_mode`). Three regression tests in
  `tests/unit/actions/register_tab_actions.test.ts`.

## Verification

- `cargo check` clean (pre-existing warnings only).
- `cargo test --lib code_lsp::language_config` → 5/5 pass.
- `pnpm test` → 3830/3830 pass.
- `pnpm check` → 0 errors, 3 pre-existing a11y warnings.
- `pnpm lint` → 1 pre-existing layering violation in
  `src/lib/features/note/application/note_actions.ts:38` (commit
  `fbf3accc5`, 2026-05-25 — unrelated to this run; should be addressed
  separately).

## Remaining work

- **Phase 2 (next)** — MCP/CLI link repair, fully scoped in the plan.
- **Phase 3** — indexing + PDF (P3.1, P3.2, P3.3 audit).
- **Phase 4** — search/query (P4.1–P4.4).
- **Phase 5** — editor & transclusion (P5.1 spike → P5.2, P5.3).

## Known risks / caveats for next session

- The P1.3 acceptance asks for a human-verified repro
  (toggle source/visual → close → no ghost across 10 runs). This
  autonomous session cannot drive the Tauri shell, so the structural
  fix landed without that visual check. If the symptom recurs, the
  next places to look are (a) the
  `services.editor` mount/unmount race for the active tab, and (b)
  whether `SecondaryNoteEditor` correctly re-renders when the secondary
  tab is closed (it reads `get_cached_note(secondary_tab.id)` which can
  go null after `capture_active_tab_snapshot` clears clean caches).
- The pre-existing layering violation should not be lumped into Phase 2;
  flag it for an isolated fix.

## Instructions for next session

Read the plan, identify the next incomplete phase (Phase 2), complete
exactly one phase, update this handoff, update status.env, commit, and
stop.
