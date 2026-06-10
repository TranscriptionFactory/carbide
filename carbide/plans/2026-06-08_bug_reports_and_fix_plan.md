# Bug Reports & Fix Implementation Plan — 2026-06-08

Nine user-reported bugs, with code-level root-cause analysis and a focused fix
plan per bug. Cross-file impact is small for most; bug 5 (linked sources) has
the largest blast radius. No backwards-compat shims — internal-only product,
clean refactors preferred.

## Triage summary

| ID  | Area                   | Severity | Effort | Root cause confidence |
| --- | ---------------------- | -------- | ------ | --------------------- |
| 1   | Inline AI (editor)     | High     | S      | Confirmed             |
| 2   | Sidebar (dashboard)    | Medium   | S      | Needs reproduction    |
| 3   | Terminal Option+arrows | Medium   | S      | High                  |
| 4   | File explorer drill    | Medium   | S      | Confirmed             |
| 5   | Linked sources resolve | High     | M      | Confirmed             |
| 6   | Task query embed       | Low      | XS     | Confirmed             |
| 7   | HTML tab scroll        | Medium   | S      | Confirmed             |
| 8   | Log panel filter       | Medium   | S      | Confirmed             |
| 9   | Tag fuzzy filtering    | Medium   | XS     | Confirmed             |

---

## BUG-1: Inline AI inserts at start of selection; retry continues after instead of replacing

**Component:** features/ai (inline menu) + features/editor (ai_menu_plugin)
**Severity:** High
**Status:** Done (fix/batch-c-inline-ai, commit 8a95a993)
**Evidence:**

- `src/lib/features/ai/application/ai_actions.ts:539` — `const anchor_pos = view.state.selection.from;` (always anchors at selection start)
- `src/lib/features/ai/application/ai_actions.ts:551-552` — streamed chunks are `view.state.tr.insertText(chunk.text, current_state.ai_range_to)`, with `ai_range_to` initialized to `anchor_pos`.
- `src/lib/features/editor/adapters/ai_menu_plugin.ts:119-126` — `start_stream` resets `ai_range_from = ai_range_to = meta.anchor_pos`, but never deletes the selected range nor records it.
- `src/lib/features/editor/adapters/ai_menu_plugin.ts:123` — `original_doc: tr.before` snapshots the doc at the start of stream; on retry this is the *post-first-generation* doc, so reject can't roll all the way back, and the second stream inserts a *new* range alongside the first.
- "Try again" wires to `on_command("retry")` (`src/lib/features/editor/ui/ai_inline_menu.svelte:92`), which re-dispatches `ai_execute_inline` with `command_id: "retry"`. There is no "retry" command in `BUILTIN_INLINE_COMMANDS` (`src/lib/features/ai/domain/ai_inline_commands.ts`), so the prompt builder will fall back / silently mis-route. Even if the new stream succeeds, the previous AI text is *not* removed before the new insertion.

**Expected behavior:**

- With a selection: AI output should *replace* the selection (or at minimum insert at the end), like every other "improve / simplify / translate" UX in this app and elsewhere.
- Retry: should discard the previous generation (clear the AI range), keep the original selection or cursor anchor, and re-stream into the cleared range.

**Actual behavior:**

- Selection: streamed text is inserted at `from` (start of selection), shoving the selected text to the right; nothing is replaced.
- Retry: a new generation is appended after the existing one; original_doc is overwritten by `tr.before`, so reject after retry can no longer restore the pristine pre-AI state.

**Reproduction:**

1. Select a sentence in a note.
2. Open the inline AI menu, run "Improve writing".
3. Observe AI text appears *before* the selected sentence.
4. Click "Try again".
5. Observe a second generation appended after the first; both visible.

**Fix plan:**

1. In `ai_execute_inline` (ai_actions.ts:507):
   - Capture the selection range *before* dispatching `start_stream`.
   - Extend the `start_stream` meta with `{ anchor_pos, selection_from, selection_to }`.
   - If `selection_from !== selection_to`, dispatch a transaction that deletes that range *and* sets the AI anchor to `selection_from` in a single TR (before streaming begins). Use `tr.delete(selection_from, selection_to)`.
2. In `ai_menu_plugin.ts:apply`:
   - Pristine snapshot must be captured once at `"open"`, not at every `start_stream` (so retry-then-reject restores all the way).
   - Keep `original_doc` in state through retries.
3. Add a `"retry"` action variant in `AiMenuMeta` that:
   - Replaces the `ai_range_from..ai_range_to` slice with empty content.
   - Resets `ai_range_to = ai_range_from`, `streaming = true`.
4. In `ai_inline_menu.svelte`, the "Try again" button should dispatch a dedicated `retry` action (not `on_command("retry")` which fires through the command pipeline with an unknown id). The new flow:
   - Cleanup decoration + AI range via the new retry meta.
   - Re-execute the *original* command (need to remember the last `command_id` / `prompt` in plugin state).

**Files to change:**

- `src/lib/features/ai/application/ai_actions.ts` (action handler)
- `src/lib/features/editor/adapters/ai_menu_plugin.ts` (state machine, retry meta, original_doc lifetime)
- `src/lib/features/editor/ui/ai_inline_menu.svelte` (retry wiring)

**Tests:**

- Unit: `ai_menu_plugin` state apply — start_stream on empty cursor vs. selection produces correct ai_range_from/to; retry resets stream range; reject restores `original_doc` even after retry.
- E2E (or integration with a fake EditorView): with selection, full round-trip leaves selected text replaced by AI output; retry replaces previous AI output rather than appending.

---

## BUG-2: Activity bar Dashboard icon unresponsive

**Component:** app/bootstrap/ui/activity_bar.svelte + app/orchestration
**Severity:** Medium
**Status:** NOT REPRODUCIBLE via static analysis — no fix applied (per the
gate below). Traced the full click→render chain on 2026-06-09; every
hypothesis here is disproven:

- Dashboard button is wired and gated under `is_vault_mode`
  (activity_bar.svelte:66-76) — identical gating to the working `tasks`,
  `graph`, `tags` views, so not a lite/vault mismatch.
- Click path is sound: `on_open_view("dashboard")` →
  `toggle_sidebar_view` → `ui_set_sidebar_view` action →
  `parse_sidebar_view("dashboard")` (passes through unchanged) →
  `set_sidebar_view` which sets the view AND `sidebar_open = true`
  (ui_store.svelte.ts:476-478).
- No render throw possible: `dashboard_stats` is initialized to
  `{ status: "idle", value: null, error: null }` (never undefined);
  `is_vault_mode === (vault?.mode === "vault")` guarantees
  `stores.vault.vault` is non-null inside the gate; `dashboard_task_counts`
  returns `null` or an object; panel props use `.value?.x ?? null`.
- No competing writer/reactor resets `sidebar_view` away from "dashboard".

The reported symptom ("explorer remains, nothing changes") contradicts the
verified-correct path, so the cause is environment-specific (a particular
layout_variant, a plugin sidebar view, a stale build, or a runtime console
throw) and needs the in-app devtools reproduction below. No speculative
"safe-default" guard was added — the props are already null-safe, so it
would be a no-op.
**Evidence:**

- Button is wired (`activity_bar.svelte:66-77`): clicks call `on_open_view(SIDEBAR_VIEWS.dashboard)`.
- `workspace_layout.svelte:266 toggle_sidebar_view` → `ui_set_sidebar_view` → `stores.ui.set_sidebar_view` (`ui_store.svelte.ts:476-479`) which sets the view AND opens the sidebar.
- Render gate at `workspace_layout.svelte:604` requires `is_vault_mode && sidebar_view === "dashboard"`.
- The `$effect` at `workspace_layout.svelte:253-264` forces the view back to `explorer` if `!is_vault_mode`. **No bug here for vault mode.**
- `VaultDashboardPanel` props include `task_counts={dashboard_task_counts}` and `stores.notes.dashboard_stats`. If `dashboard_task_counts` or `dashboard_stats` is `undefined` at first paint, Svelte may throw during render of the panel and silently keep the click as a no-op visually.

**Hypothesis (highest confidence):** the click *does* fire and the store updates, but the panel render fails for one of:

- `stores.notes.dashboard_stats` not initialized when entering dashboard for the first time after app launch.
- `dashboard_task_counts` derivation throws (unconfirmed; need to inspect).
- An empty `is_vault_mode` (e.g., lite shell) is silently true but the dashboard subroute is excluded from the lite build (see `839c7900 refactor: make lite UI surfaces explicit`).

**Reproduction:**

1. Open Carbide in vault mode.
2. Click the Dashboard icon (LayoutDashboard) in the Activity Bar.
3. Observe: nothing visibly changes; explorer remains visible.

**Investigation steps (before coding):**

- Add a `console.log` (or use the existing log panel) to `toggle_sidebar_view` to confirm the click reaches it.
- Check the devtools console for thrown errors on first dashboard click.
- Verify `stores.notes.dashboard_stats` and `dashboard_task_counts` are derived and not undefined-throwing.
- Verify `is_vault_mode` evaluates true for the current shell.

**Fix plan (contingent):**

- If render throws: guard `VaultDashboardPanel` props with safe defaults (e.g. `?? 0`, `?? []`) and surface load state via the existing `stats_status` prop.
- If lite gating: either remove the dashboard button in lite mode (mirror `is_vault_mode` gate) or wire the lite shell to support it.
- If a stale `sidebar_open` causes a no-op visual: confirm `set_sidebar_view` does in fact flip `sidebar_open=true` (it does at line 478) and trace any reactor that flips it back off (none found).

**Files to change (likely):**

- `src/lib/app/bootstrap/ui/workspace_layout.svelte` (defensive prop defaults, or gate button)
- Possibly `src/lib/features/note/state/note_store.svelte.ts` if `dashboard_stats` lazy-init is at fault.

**Tests:**

- Component test: clicking the dashboard activity-bar button when in vault mode mounts `VaultDashboardPanel` without throwing, even with empty stats.

---

## BUG-3: Option+Arrow regressed in terminal — no longer moves cursor by word

**Component:** features/terminal (xterm.js config)
**Severity:** Medium
**Status:** Open
**Evidence:**

- `src/lib/features/terminal/ui/terminal_session_view.svelte:283` — `macOptionIsMeta: true` was introduced in commit `d3ed0401` (April 18). The commit title ("fixing heading modification on blank lines") is unrelated; this was a drive-by change.
- xterm.js with `macOptionIsMeta: true` emits modified CSI sequences for Option+Arrow (`\x1b[1;3D` / `\x1b[1;3C`). Default zsh/bash bindings do NOT bind those to `backward-word` / `forward-word`. Without `macOptionIsMeta`, xterm.js falls back to OS-typed Option chars; arrows aren't OS-typed and would emit a plain `\x1b[D`/`\x1b[C`, which the shell treats as cursor-by-char.
- The hotkey hook at `src/lib/hooks/use_keyboard_shortcuts.svelte.ts:152` lets Alt-modified events pass when terminal is focused (no capture-map hit for bare `Alt+ArrowLeft`), so the key reaches xterm.js. The regression is therefore *inside* xterm.js sequence emission, not in our hotkey layer.

**Expected behavior:**

- Option+Left and Option+Right move cursor by word in the active shell, matching macOS Terminal.app / iTerm2 defaults.

**Actual behavior:**

- Option+arrow does nothing visible (or moves by single char), because the emitted escape sequence is not bound in the user's shell.

**Fix plan:**

1. Remove `macOptionIsMeta: true` (or set to `false` explicitly) so xterm.js emits the standard `\x1bb`/`\x1bf`-style sequences that readline/zle bind by default.
2. If that breaks Option+letter on macOS (e.g., produces `ø` instead of `Esc+o`), the proper fix is to set `macOptionIsMeta` selectively or expose a setting. The simplest robust default for shell use is `macOptionIsMeta: false` + relying on terminal sending `Esc+<key>` for Option+letter via xterm's own readline-friendly mode.
3. Verify behavior in zsh (default macOS shell) and bash both for word motion *and* Option+letter typing.

**Files to change:**

- `src/lib/features/terminal/ui/terminal_session_view.svelte` (drop or invert `macOptionIsMeta`)

**Tests:**

- Manual: open a terminal tab, type `echo hello world`, press Option+Left twice — cursor lands at start of "world", then "hello".
- Regression guard: if we add a terminal settings panel, expose `terminal_mac_option_is_meta` and snapshot-test the xterm config.

---

## BUG-4: No right-click context menu in drill-down file explorer

**Component:** features/folder (drilldown_file_tree.svelte)
**Severity:** Medium
**Status:** Open
**Evidence:**

- `src/lib/features/folder/ui/file_tree_row.svelte:401-491` wraps each row in `<ContextMenu.Root>` with full rename/delete/star/canvas affordances.
- `src/lib/features/folder/ui/drilldown_file_tree.svelte:118-144` renders rows as plain `<button>` elements with no `ContextMenu` wrapper.

**Expected behavior:**

- Right-clicking an entry in drill-down view shows the same context menu as the tree view: open, rename, delete, star, reveal, etc.

**Actual behavior:**

- Right-click does nothing (or shows the native browser context menu via Tauri's fallback).

**Fix plan:**

- Refactor the row body of `drilldown_file_tree.svelte` to use the same `FileTreeRow` component, or
- Wrap each drill row in a `<ContextMenu.Root>` with the relevant actions, deduped via a shared `file_tree_row_menu.svelte` if duplication grows.
- Action items should plug into the same `folder_actions` (`features/folder/application/folder_actions.ts`) the tree uses, so wiring is one-line per item.

**Files to change:**

- `src/lib/features/folder/ui/drilldown_file_tree.svelte`
- (Optionally) extract `src/lib/features/folder/ui/file_tree_context_menu.svelte` and share between drill + tree to keep parity.

**Tests:**

- Component test: right-clicking a drill row shows menu items; selecting "Rename" calls the rename action with the entry path.

---

## BUG-5: Linked-source resolution still broken across machines, plus startup delay

**Component:** features/reference (linked sources)
**Severity:** High
**Status:** Done (fix/batch-e-linked-sources, commits a3494f93 + e37ad5b8). NOTE:
implemented differently from the prescription below — the real open/preview
resolver is the Rust `resolve_linked_note_file_path` (callers hold a note_path,
not a meta), so existence-checking lives there rather than a new TS
`resolve_existing(meta)` port method. Startup-defer was already in place via
`reference_library_load.reactor`; commit 2 added the missing per-call list_files
timeout + a "Refresh sources" action.
**Evidence:**

- `src/lib/features/reference/domain/linked_source_paths.ts:50-66 resolve_linked_path`:
  ```ts
  if (meta.external_file_path) return meta.external_file_path;
  if (meta.vault_relative_path && vault_root) return posix_resolve(...);
  if (meta.home_relative_path && home_dir) return ...;
  return null;
  ```
  The resolver **returns the stale absolute path unconditionally** when `external_file_path` is set, even though we have stable relative anchors. On a second machine, that absolute path (e.g. `/Users/alice/iCloud/...`) does not exist, but is still returned.
- `src/lib/features/reference/application/reference_service.ts:691-697` already anticipates this for the *scan* path (it strips `external_file_path` before calling `resolve_linked_path` when re-locating a removed file), but every other call site uses `resolve_linked_path` directly with the absolute path present.
- Startup delay: `reference_service.load_linked_sources` (line 494) is awaited in the vault open flow, then iterates sources to compute `home_relative_path` synchronously, and `scan_linked_source` (line 607) is kicked off per source. Each scan calls `ls_port.list_files(effective_path)` against a possibly-unreachable absolute path (e.g., a not-yet-mounted iCloud folder), which on macOS can stall on FS calls for several seconds before failing.

**Expected behavior:**

- On a different machine, linked sources resolve via `vault_relative_path` (sibling-folder case is exactly this) or `home_relative_path`, and `external_file_path` is treated as a *cache* that must be validated before use.
- Startup does not block on linked-source scans; scans run after the UI is responsive.

**Actual behavior:**

- Returns a stale absolute path; downstream open/preview fails as if the source is missing.
- App startup blocks for noticeable time while scans against unreachable absolute paths time out.

**Fix plan:**

1. **Resolver:** flip `resolve_linked_path` to prefer the most-portable anchor first when the vault has moved. The cleanest version:
   - Compute candidates in order: `vault_relative_path` (if `vault_root`), `home_relative_path` (if `home_dir`), `external_file_path`.
   - The resolver is *pure* — it can't `stat` — so we cannot "test existence" here. Instead, change the *contract*: callers now ask the adapter (`ls_port`) for the first existing candidate via a new `resolve_existing(meta, vault_root, home_dir)` method that walks the candidate list and returns the first whose file exists.
   - Document in the file header that `external_file_path` is a *cache hint*, not the source of truth.
2. **Caller migration:** every site currently calling `resolve_linked_path` for *opening* or *previewing* a file should call `resolve_existing` instead. The existing call sites for *building metadata* (e.g., enrichment) keep `resolve_linked_path` as a pure helper.
3. **Startup delay:** defer `scan_linked_source` until after the first paint:
   - `load_linked_sources` should populate the store and return immediately.
   - Schedule scans via a reactor that fires after `vault.is_ready` flips, batched/staggered.
   - Add a per-source timeout to `ls_port.list_files` (Tauri side) — 5s default — so an unreachable mount doesn't hold the UI hostage.
4. Add an explicit "Refresh sources" action so users can opt back into a sync scan from settings.

**Files to change:**

- `src/lib/features/reference/domain/linked_source_paths.ts` (resolver re-ordering + docstring)
- `src/lib/features/reference/ports.ts` and `adapters/linked_source_tauri_adapter.ts` (new `resolve_existing` method)
- `src-tauri/src/features/reference/linked_source.rs` (Rust resolver: `resolve_existing` command; per-call timeout on `list_files`)
- `src/lib/features/reference/application/reference_service.ts` (callers migrate; `load_linked_sources` becomes non-blocking; scans triggered by reactor)
- (Possibly) `src/lib/reactors/` (add a `linked_sources_scan_reactor.ts`)

**Tests:**

- Unit: `resolve_existing` with a `vault_relative_path` that matches a real sibling, and a stale `external_file_path`, returns the sibling path; with all candidates missing, returns null.
- Unit: `load_linked_sources` resolves before any scan runs; scans are scheduled on a separate microtask/reactor.
- Manual on a second machine: clone a vault + sibling sources folder under a different home dir, open Carbide, observe links resolve.

---

## BUG-6: Task-query embed still shows full heading hierarchy

**Component:** features/editor (task-query view in prosemirror code block)
**Severity:** Low
**Status:** Open
**Evidence:**

- Commit `97dbd6ac` (P4.2) made `extract_tasks` emit `section` as a slash-joined ancestry (`Project A/Subproject B`) for query purposes.
- `src/lib/features/editor/adapters/code_block_view_plugin.ts:356-361` renders the section verbatim:
  ```ts
  section_el.textContent = task.section;
  ```
- The task panel (`src/lib/features/task/ui/task_list_item.svelte:68`) already shows only the leaf: `task.section.split("/").pop()`. The embed renderer was not updated to match.

**Expected behavior:**

- The inline task-query embed displays the *leaf* heading (or the smallest disambiguating tail). Tooltip / hover may show the full hierarchy.

**Actual behavior:**

- Embed shows `Project A/Subproject B/Sub-sub` as a single inline label, which is visually noisy.

**Fix plan:**

- Mirror the task-panel rendering in the code-block view: leaf segment as text, full path as `title` attribute for hover.
- Centralize the formatting helper to avoid drift — e.g., `src/lib/features/task/domain/section_label.ts` with `leaf_of_section(section: string)` and `full_section_path(section: string)`.

**Files to change:**

- `src/lib/features/editor/adapters/code_block_view_plugin.ts` (use helper)
- `src/lib/features/task/domain/section_label.ts` (new)
- `src/lib/features/task/ui/task_list_item.svelte` (use helper)

**Tests:**

- Unit: `leaf_of_section("A/B/C") === "C"`; `leaf_of_section("Top") === "Top"`; empty/undefined safe.

---

## BUG-7: Scroll position not retained for HTML documents when switching tabs

**Component:** features/document (html_viewer, html_live_renderer)
**Severity:** Medium
**Status:** Open
**Evidence:**

- Code/CSV viewers persist scroll via `stores.document.update_scroll(tab_id, scroll_top)` and read `initial_scroll_top` on mount (see `code_viewer.svelte:109/166/179`).
- `html_viewer.svelte` and `html_live_renderer.svelte` have no scroll plumbing — no `onscroll`, no `initial_scroll_top` prop, no `update_scroll` call.
- The viewer state (`features/document/application/document_service.ts:191-202`) already tracks `scroll_top: number`, so the store side is ready.

**Expected behavior:**

- Switching away from and back to an HTML document restores the scroll offset, same as code/CSV/PDF.

**Actual behavior:**

- HTML document scrolls back to top on every tab switch (and probably on every re-render of the live renderer).

**Fix plan:**

1. Add `initial_scroll_top?: number` and `on_scroll_change(scroll_top)` props to `html_viewer.svelte` and `html_live_renderer.svelte`.
2. Wire `onscroll` on the scroll container, debounce ~150 ms, and call `stores.document.update_scroll(tab_id, scroll_top)`.
3. On mount / on `tab_id` change, set `scroll_root.scrollTop = initial_scroll_top` (after the content has rendered — wrap in `requestAnimationFrame` or run after the prerender promises resolve in `html_live_renderer.svelte`).
4. Pass the props from `document_viewer_content.svelte` (the parent that already does this for code/CSV).

**Files to change:**

- `src/lib/features/document/ui/html_viewer.svelte`
- `src/lib/features/document/ui/html_live_renderer.svelte`
- `src/lib/features/document/ui/document_viewer_content.svelte` (prop wiring)

**Tests:**

- Component test: open an HTML doc, scroll, switch tab, switch back — `scroll_root.scrollTop` matches stored value.

---

## BUG-8: Log panel — only the "Log" filter option shows entries (all log levels merged there)

**Component:** features/lint (problems_panel_content)
**Severity:** Medium
**Status:** Open
**Evidence:**

- `src/lib/features/lint/ui/problems_panel_content.svelte:202-213` — severity dropdown options: `all | error | warning | info | hint | log`.
- The first four options filter `diagnostics` (LSP / linter), not log entries. They look empty because the project rarely emits diagnostics.
- The `log` option (line 277) is the only branch that renders entries from `log_store` — which is where *all* `logger` calls land regardless of level (`error`, `warn`, `info`, `debug`, `trace`).
- Result: the dropdown is conceptually conflating two streams (diagnostics + logs) under one filter axis, and users see "everything under Log, nothing under everything else."

**Expected behavior:**

- The severity filter should apply to *both* diagnostics and log entries: "Errors" shows diagnostic-severity-error AND `log.level === "error"`; ditto for warnings/info.
- A separate toggle controls whether to show diagnostics, logs, or both.

**Actual behavior:**

- Dropdown silos log entries away from severity filtering. The Log mode dumps all levels with no further filtering.

**Fix plan:**

1. Replace the binary "log vs diagnostics" mode with two orthogonal axes:
   - **Stream:** `all | diagnostics | logs` (or two checkboxes).
   - **Severity:** `all | error | warning | info | debug | trace` — apply to whichever stream is active.
2. Map log levels to diagnostic severities (or share an enum): `error → error`, `warn → warning`, `info → info`, `debug/trace → debug`.
3. When stream is `all`, merge the two filtered arrays, sorted by timestamp.
4. Keep the existing source/file filter only for the diagnostics stream (hide it when stream is "logs").

**Files to change:**

- `src/lib/features/lint/ui/problems_panel_content.svelte` (UI + filter logic)
- `src/lib/features/lint/state/log_store.svelte.ts` (consider exposing a derived list with diagnostic-shaped entries for easier merging)

**Tests:**

- Unit: with a log entry `{level: "error"}` and a diagnostic `{severity: "error"}`, the "Errors" filter returns both.
- Unit: "Trace" only matches log entries with `level === "trace"`.

---

## BUG-9: Tag fuzzy filtering doesn't work in @ / # palettes, hierarchical tags don't match by leaf

**Component:** features/editor (tag suggest), features/tags (matcher)
**Severity:** Medium
**Status:** Open
**Evidence:**

- `src/lib/features/editor/application/editor_service.ts:894-896` (tag suggest):
  ```ts
  const filtered = tags.filter((t) =>
    t.tag.toLowerCase().startsWith(lower_query),
  );
  ```
- `src/lib/features/editor/application/editor_service.ts:999-1009` (`@` palette tag query): identical `startsWith` filter.
- The `features/tags/domain/tag_matcher.ts` module already exports `rank_tags(query, tags, limit)` which scores by hierarchical / substring / fuzzy — but **neither suggest pipeline uses it**.

**Expected behavior:**

- Typing `#child` matches `parent/child` (leaf substring/fuzzy match).
- Typing `#prnt` fuzzy-matches `parent`.
- Hierarchical: typing `#parent/` ranks `parent/child`, `parent/grandchild` first.

**Actual behavior:**

- Only prefix matches against the *full* tag string work. Leaf and fuzzy queries return nothing.

**Fix plan:**

1. Replace both `startsWith` filters with `rank_tags(query, tags.map(t => t.tag), limit)`, preserving the `count` by re-joining via a map.
2. Tune `tag_matcher` scores: hierarchical ranks above leaf-substring above fuzzy. The current weights look acceptable; verify against unit tests.
3. Confirm the suggest dropdown sort order matches scored order (currently relies on incoming order).

**Files to change:**

- `src/lib/features/editor/application/editor_service.ts` (both `handle_tag_suggest_query` and `handle_at_palette_tag_query`)

**Tests:**

- Unit: existing `tag_matcher` tests cover the scoring. Add an integration test asserting `handle_tag_suggest_query("child", [...])` returns `parent/child` ranked above unrelated tags.
- Manual: open the `#` palette and type `child` — `parent/child` should appear.

---

## Suggested rollout order

1. **Bug 9** (tag fuzzy) — one-file change, immediate UX win.
2. **Bug 6** (task query embed) — trivial, shared helper.
3. **Bug 7** (HTML scroll) — small isolated change, parity with other viewers.
4. **Bug 4** (drill context menu) — refactor for parity, low risk.
5. **Bug 3** (Option+arrow) — single-line config flip, manual verification.
6. **Bug 1** (inline AI) — state-machine touch in `ai_menu_plugin`, moderate test surface.
7. **Bug 8** (log panel) — filter UX redesign, no data migration.
8. **Bug 5** (linked sources) — largest blast radius; do last and behind a focused PR. Ship resolver fix and startup-defer in two separate commits.
9. **Bug 2** (dashboard icon) — needs in-app reproduction before fix; do not block other items on it.

Each bug should land as its own commit. Tests added alongside the fix per [AGENTS.md](../../AGENTS.md) testing standards.

## Batching (single-conversation groupings)

Bugs grouped by shared context window, files touched, and mental model. Each
batch should land as one conversation with one commit per bug.

### Batch A — "Quick wins" (BUG-3, BUG-6, BUG-9)

Each bug is a one-file change, no overlapping files, no state-machine work.
Sized to fit comfortably in one session with full test coverage.

- **BUG-9** — replace two `startsWith` filters in `editor_service.ts` with `rank_tags`.
- **BUG-6** — extract `section_label.ts`, swap in code-block view + task list item.
- **BUG-3** — drop `macOptionIsMeta: true` in `terminal_session_view.svelte`, verify manually.

Shared mental model: "use the helper we already have / drop the bad config." Low risk; ship in three back-to-back commits.

### Batch B — "Viewer parity" (BUG-4, BUG-7)

Both are "feature X exists in canonical surface, mirror it onto the alternate surface."

- **BUG-4** — drilldown rows get the same `ContextMenu.Root` wrapper as tree rows. Extract `file_tree_context_menu.svelte` to avoid duplication.
- **BUG-7** — HTML viewers get the same scroll plumbing as code/CSV viewers.

Shared mental model: "lift the existing pattern into a shared piece, apply to both surfaces." Touches `features/folder` + `features/document` — no overlap with Batch A.

### Batch C — "Inline AI fix" (BUG-1, solo)

State-machine change in `ai_menu_plugin.ts` plus action-layer wiring. Needs careful test coverage of: cursor-only, selection, retry-after-cursor, retry-after-selection, reject-after-retry. Worth its own conversation so the test matrix stays in view.

### Batch D — "Log panel UX" (BUG-8, solo)

Filter axis redesign. Self-contained to `problems_panel_content.svelte` + possibly `log_store`. Stand-alone conversation because the UX decision (two checkboxes vs. one dropdown with merged levels) wants undivided attention.

### Batch E — "Linked sources" (BUG-5, solo, two commits)

Crosses TS + Rust, changes a port contract, touches startup ordering. Definitely its own conversation. Land in two commits:

1. Resolver + `resolve_existing` adapter method (synchronous semantic change).
2. Startup-defer reactor + Tauri `list_files` timeout (perf/UX change).

### Batch F — "Dashboard icon" (BUG-2, solo, gated on repro)

Investigation first (open devtools, click icon, log what happens). Do not bundle with anything until the failure mode is known — could be a five-line guard or a deeper lite/vault-mode gating issue.

### Recommended starting batch

**Batch A**. Three independent quick wins, fast feedback loop, builds momentum before tackling Batch C or E. The starting prompt is below.

---

## Starting prompt — Batch A (quick wins)

> Implement Batch A from `carbide/plans/2026-06-08_bug_reports_and_fix_plan.md`: BUG-9 (tag fuzzy), BUG-6 (task-query embed), BUG-3 (terminal Option+arrow). Land each as its own commit in the order listed. For each:
>
> 1. Read the bug section in the plan for the exact files and approach.
> 2. Make the change.
> 3. Add the unit tests called out in the plan's "Tests" subsection (place under `tests/` per AGENTS.md).
> 4. Run `pnpm check && pnpm lint && pnpm test` and fix anything that breaks.
> 5. Commit with a focused message referencing the bug ID.
>
> Skip BUG-3's manual verification step — flag it in the commit body so I can verify Option+arrow in a real terminal after the change lands. Do not touch anything outside the three bugs' scope; if you spot related issues, note them in the plan rather than fixing inline.
