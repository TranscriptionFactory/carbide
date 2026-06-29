# Carbide Triage — Bug/Feature Triage, Grouped · Parallelized · Prioritized

## Context

14 raw bug reports / feature requests for Carbide (Tauri + Svelte 5 + ProseMirror note editor). Goal: group by similarity, group by parallelize-ability, rank by priority (balanced lens — correctness bugs and high-friction blockers first; the one big architectural item deferred), and stage the first parallel batch with concrete steps. Every item is grounded in actual files (callout/embed/preview confirmed by reading; rest mapped by exploration). Effort is a rough signal.

## 1. Similarity Clusters

| Cluster | Items | Why grouped (shared files / concept) |
|---|---|---|
| **A — Callouts** | #1, #7 | `schema.ts` callout spec, `callout_view_plugin.ts`, `remark_callout.ts`. #1 is the prerequisite bug fix #7 builds on. |
| **B — Embed/preview rendering** | #2 | `html_embed_renderer.ts`, `code_preview.ts`. Theme-token injection into sandboxed iframes. |
| **C — Nodeview consistency** | #4 | `resize_handle.ts`, `*_view_plugin.ts`. Uniform resize across nodeviews. |
| **D — Block authoring affordances** | #5, #8 | `block_drag_handle_plugin.ts`, `slash_command_plugin.ts`, placeholder plugin. "How do I create/discover blocks." |
| **E — Tables** | #6 | `table_extension.ts`, `table_toolbar_plugin.ts`, schema table spec. Isolated port from Open Knowledge. |
| **F — Navigation / scroll / sidebar** | #3, #9 | Tab activation + scroll restore (#3) and sidebar/command-palette wiring (#9). #3 should land before #9 touches tab flow. |
| **G — Search / path matching** | #11, #12 | Path picker drill-down (#11, prefix) and @-palette fuzzy (#12, fuzzy). **Do NOT share a matcher** — independent. |
| **H — RAG** | #14 | `rag_service.ts` scope + error handling, `rag_*.svelte` rendering. |
| **I — Workspace state foundation** | #13 | `.ok`-style persistent state/config (see the deferred-features + state research doc for the verdict). |

## 2. Priority Ranking (balanced lens)

| Rank | Item | Class | Effort | Rationale |
|---|---|---|---|---|
| 1 | **#1** Callout collapse lost | Bug | S | Correctness + cheap; confirmed schema gap. |
| 2 | **#2** Embed black bg / charts | Bug | S | Finish already-committed fix; visible, isolated. |
| 3 | **#3** Scroll jump on tab switch | Bug | M | Hits on *every* tab switch — highest-frequency friction. |
| 4 | **#11** Path drill-down broken | Bug | S–M | Blocks saving into nested folders — workflow blocker. |
| 5 | **#12** @-palette fuzzy broken | Bug | M | Breaks file linking/navigation, a core flow. |
| 6 | **#14** RAG no-output / scope | Bug | M | Feature looks broken (silent failures). Ranked below editor bugs — RAG is lower-traffic. |
| 7 | **#7** Callout config | Feat | M | Builds on #1. |
| 8 | **#5** Block add dropdown | Feat | M | Authoring improvement; reuse slash-command arch. |
| 9 | **#8** Ghost text "type /" | Feat | S–M | Discoverability; reuse slash-command arch. |
| 10 | **#4** Nodeview resize consistency | Feat | M | Polish across nodeviews. |
| 11 | **#6** Table formatting from OK | Feat | M | Isolated OK port (frozen headers, edge insert bars, md fidelity, header toggles). |
| 12 | **#9** Sidebar configurable | Feat | L | Large; note dashboard icon **already works** via palette (see §5 note). |
| 13 | **#13** `.ok` workspace state/config | Arch | — | **Largely already satisfied** — see the deferred-features + state research doc. Recommendation: skip the rewrite. |

## 3. Parallelization Map

**First batch = the 6 top bugs, runnable as ~5 concurrent streams** (disjoint files except where noted):

| Stream | Items | Owns (files) |
|---|---|---|
| **S1 Callouts** | #1 (then #7 later) | `schema.ts` callout region, `callout_view_plugin.ts`, `remark_callout.ts` |
| **S2 Embeds** | #2 | `html_embed_renderer.ts` (+ its view-plugin caller) |
| **S3 Editor-nav** (sequence #3→#12) | #3, #12 | `tab_action_helpers.ts`, `source_editor_content.svelte`, `editor_service.ts`, `at_palette_plugin.ts`, `fuzzy_score.ts` |
| **S4 Path picker** | #11 | `folder_suggest_input.svelte`, `filter_folder_paths.ts` |
| **S5 RAG** | #14 | `rag_service.ts`, `rag_message.svelte`, `rag_panel.svelte` |

**Shared-file conflict warnings (coordinate, don't parallelize blindly):**
- `editor_service.ts` — touched by #3 **and** #12 → kept in one stream (S3), sequence them.
- `schema.ts` — callouts (#1/#7) edit lines ~376–412, tables (#6) edit ~723–822 → different regions; if #6 runs alongside S1, rebase carefully or stage tables after callouts.
- `code_block_view_plugin.ts` — relevant to #4 (resize) and the older #2 code-preview path → flag for the *feature* batch, not the first batch (#2's remaining work is `html_embed_renderer.ts` only).

## 4. Staged First Batch — Concrete Steps

> **STATUS — Part 1 complete (2026-06-28).** All six top bugs (#1, #2, #3, #11, #12, #14) implemented, unit-tested, and committed on `fix/triage-batch-1` (one commit each). Full suite green: 423 files / 4600 tests, `pnpm check` 0 errors. Deviations from the plan's assumptions, surfaced during implementation, are noted inline below.
> - **#11** root cause was **backend**, not the frontend filter: `scan_folder_entries` is non-recursive. Fixed with **no Rust change** by sourcing the picker from the already-recursive `list_folders` command (via `list_all_folders`) on save-dialog open — the same source the settings picker uses.
> - **#2** the caller (`file_embed_view_plugin.ts`) had no editor-context theme; it reads `data-color-scheme` off `document.documentElement` directly, like `code_block_view_plugin.ts`.
> - **#3** is a timing fix (bounded re-assert across frames); its end-to-end behavior still needs **manual verification in the running app** (incl. the dialog case) — not unit-testable.
> - **#14** error *display* already worked end-to-end; the only real defect was the silent scope-degrade, now surfaced as an error.

### #1 — Callout collapse state-loss (S1) — `Small`
**Cause (confirmed):** `schema.ts:384` declares `folded`, but `parseDOM.getAttrs` (`schema.ts:389-396`) and `toDOM` (`schema.ts:399-410`) omit it; runtime fold toggles via `setNodeMarkup` (`callout_view_plugin.ts:103-112`) are lost on any DOM re-parse / clipboard / serialization round-trip.
**Steps:**
1. Reproduce; decide intended semantic — does a *runtime* collapse persist across reload, or only `default_folded`? Check `remark_callout.ts` round-trip for `foldable`/`default_folded`.
2. Serialize `folded` in `toDOM` (`data-folded`) and read it back in `parseDOM.getAttrs`, mirroring `foldable`/`default_folded`.
3. In `callout_view_plugin.ts` `update()` (114-127), re-sync the toggle element when `foldable` changes (currently only icon/class refresh).
**Verify:** fold a callout → switch tabs / reload → state preserved. Add a schema round-trip unit test.

### #2 — Embed black background / charts (S2) — `Small`
**Cause (confirmed):** `code_preview.ts` is fully fixed & committed (`read_preview_theme_tokens()`, pinned `color-scheme`, `--foreground`/`--background`). `html_embed_renderer.ts` still uses undefined `--carbide-fg`/`--carbide-bg` with `background: transparent` (`SAFE_EMBED_STYLES`, lines 12-21) and never injects theme tokens.
**Steps:**
1. Reuse `code_preview.ts` exports: `PREVIEW_THEME_TOKENS`, `read_preview_theme_tokens()`, and the `:root` token-injection pattern (with the `[<>{}]` CSS-injection guard).
2. In `html_embed_renderer.ts`: replace `--carbide-*` vars with theme tokens; build `:root{color-scheme:<theme>; …tokens}`; pass `theme`+`tokens` through `build_safe_embed_srcdoc` (mirror `build_code_preview_srcdoc`).
3. Thread `theme`/tokens from the embed view-plugin caller (find the caller of `build_safe_embed_srcdoc`), same as `code_block_view_plugin.ts` does for previews.
**Verify:** iframe/HTML embed + chart embed in light theme → readable bg, correct colors; toggle dark → follows app theme. Add token-injection + guard test paralleling `code_preview` tests.

### #3 — Scroll jump on tab switch (S3, do before #12) — `Medium`
**Cause (suspected):** scroll capture/restore in `tab_action_helpers.ts` (~95-179) + `source_editor_content.svelte` (~117-148) restores before content is mounted/measured (race) → lands at top/bottom.
**Steps:**
1. Trace activation: confirm where per-tab scrollTop is saved and reapplied. Reapply *after* content mounts & sizes (post-`tick()`/next frame/measured layout), not synchronously.
2. Cover the dialog case (report: "including in a dialog").
**Verify:** scroll mid-doc in tab A → switch to B and back → position restored; repeat in a dialog-hosted editor.

### #12 — @-palette fuzzy search (S3, after #3) — `Medium`
**Cause (confirmed):** @-palette delegates to Rust backend `index_suggest` (via `editor_service.ts` ~963-994); path matching misses substrings inside long paths (`@rtk` ✗ `5_MISC/.../Rtk_…md`). Client-side `fuzzy_score.ts` exists but is **not** applied here.
**Steps (cheaper path — no Rust rebuild):** in `at_palette_plugin.ts`, after backend candidates return, re-rank/filter client-side with `fuzzy_score.ts` against the **full path** (and basename). Widen the backend candidate set if it pre-truncates. (Alternative, larger: fix `index_suggest` fuzzy in Rust — defer.)
**Verify:** `@rtk` surfaces `…/Rtk_sqk_…md`; basename and mid-path matches both rank sensibly.

### #11 — Path selector drill-down (S4) — `Small–Medium`
**Cause (suspected):** `filter_folder_paths.ts:15` uses `startsWith()` (correct for drill-down); the gap is likely that the candidate list fed to `folder_suggest_input.svelte` omits nested folders, so `folder1/` yields nothing for `folder1/folder2`.
**Steps:**
1. Confirm the candidate source enumerates nested folders recursively, not just top-level.
2. Verify `filter_folder_paths` matches the segment after the trailing `/` during drill-down.
**Verify:** type `folder1/` → dropdown lists `folder1/folder2`; selecting drills further.

### #14 — RAG no-output / scope silent-degrade (S5) — `Medium`
**Cause (confirmed):** `rag_service.ts` `keep_in_note_set()` (~405-421) silently returns *unfiltered* hits when a tag/base lookup fails (no error emitted); retrieval errors (~188-199) yield `{type:"error"}` events the UI may not render.
**Steps:**
1. Scope robustness: when a scope filter fails, surface it (emit error/warning, or return empty + "scope unavailable" notice). Decide semantic (empty vs warn).
2. Error display: ensure `rag_message.svelte` / `rag_panel.svelte` render `{type:"error"}` events as a visible bubble (currently likely dropped → "no output").
**Verify:** query a non-existent tag scope → clear message (not silently all-notes, not blank); force a retrieval failure → error bubble shown.

## 5. Deferred / Later Batches (detailed in the deferred-features + state research doc)

- **#7 Callout config** (after #1) — reuses S1 files.
- **#5 Block add dropdown** + **#8 Ghost text** — reuse `slash_command_plugin.ts` architecture.
- **#4 Nodeview resize** — standardize `resize_handle.ts` across embed view plugins.
- **#6 Table from OK** — port frozen headers, edge insert bars, markdown fidelity, header toggles.
- **#9 Sidebar configurable** (large): drag/drop reorder in `activity_bar.svelte`, wire all views to the palette (`search_commands.ts`). **Note:** the dashboard icon is actually wired and functional via `show_vault_dashboard` — "doesn't work" is a discovery/UX issue, so the cheap sub-win is to remove the icon or fix its affordance, not rebuild the route.
- **#13** — see the deferred-features + state research doc verdict (skip the rewrite).

## 6. Verification (whole batch)

Per `AGENTS.md` post-edit tasks, after each stream's changes:
- `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm format`.
- `cd src-tauri && cargo check` only if Rust touched (none in the first batch unless #12 takes the Rust path).
- Add/extend unit tests in `tests/` for: callout schema round-trip (#1), embed theme-token injection + guard (#2), fuzzy ranking on full paths (#12), folder drill-down filtering (#11), RAG scope-failure event emission (#14).
- Manual end-to-end per each **Verify** line (run app, reproduce original report, confirm fixed).
- Commit per stream at each verified step; keep streams on separate `fix/<name>` branches given §3 shared-file warnings.
