# Bug Research & Implementation Plan

**Date:** 2026-04-30
**Source:** `carbide/2026-04-30_bug_report.md`
**Branch:** `feat/extensible-lsp-suggest-coordination` (current)

---

## Bug 1: CLI Hangs on Startup (Linked Source Warning Blocking)

### Symptoms
- CLI hangs when a linked source path is not found
- Works fine if app is opened from CLI and user clicks through warnings
- Suggests two code paths for linked source resolution: one through CLI, one through app UI

### Root Cause Analysis

The startup sequence in `reference_library_load.reactor.svelte.ts` triggers `verify_linked_sources()` → `rescan_all_enabled_sources()` on vault open. When a linked source path doesn't exist, the verification adds it to `missing_linked_sources` and the `MissingLinkedSourceDialog` is shown.

**The problem:** The dialog requires user interaction (dismiss/relocate/delete). When launched from CLI without a visible window, the dialog is never interacted with, and the app appears to hang waiting for user action before completing initialization.

**Two code paths confirmed:**
1. **App path:** User sees dialog → clicks through → startup completes
2. **CLI path:** No visible window initially → dialog blocks → CLI appears hung

### Key Files
| File | Role |
|------|------|
| `src/lib/reactors/reference_library_load.reactor.svelte.ts` | Startup trigger |
| `src/lib/features/reference/application/reference_service.ts:901-947` | `verify_linked_sources()` |
| `src/lib/features/reference/domain/linked_source_paths.ts` | Path resolution (3-tier fallback) |

### Implementation Plan

1. **Decouple verification from blocking UI.** The reactor should complete startup regardless of missing sources. Queue the missing sources warning and only show the dialog after the main window is fully rendered and focused. This is one code path regardless of launch method (CLI or app) — no need for a separate silent fallback for CLI.
2. Check if the `$effect` in the reactor awaits the dialog result before allowing downstream reactors to proceed. If so, decouple: let verification populate `missing_linked_sources` in the store, and have the dialog reactively appear from store state once the UI is ready — not as a gate in the startup sequence.

### Sub-issue: Linked Sources Not Resolving Cross-Machine

Commit `37d107d` added `home_relative_path` for cross-machine portability. The 3-tier fallback is: `external_file_path` → `vault_relative_path` → `home_relative_path`.

**Possible causes of failure:**
- `home_relative_path` was never backfilled for sources added before `37d107d` (the migration in `load_linked_sources()` only runs if `home_dir` resolves)
- Cache/database stores absolute paths from original machine and doesn't re-resolve
- The `resolve_linked_source_root()` function falls back to stored `path` if `home_relative_path` is absent — this absolute path is machine-specific

**Fix:** Ensure the migration backfill runs reliably. Consider adding a manual "re-resolve all paths" action in settings. Check if the SQLite metadata table caches absolute paths that bypass the fallback logic.

---

## Bug 2: Linked Images Break After Reparse/Save

### Symptoms
- Wikilink images (`![[image.png]]`) work correctly
- After reparse/save, some images are converted to standard markdown syntax: `![](6_BLOB/2026-04-17_1703.png)`
- Special characters in paths get escaped, breaking the link
- Replacing with wikilink syntax restores the image
- Using `!` prefix for non-wikilink syntax breaks document parsing entirely (source editor loses structure)

### Root Cause Analysis

**Two independent pathways exist and don't interconvert:**

| | Wikilink Images | Markdown Images |
|---|---|---|
| Syntax | `![[image.png]]` | `![alt](path)` |
| Detection | `file_embed_plugin` regex | `image_input_rule_plugin` regex |
| Node type | `file_embed` | `image` / `image-block` |
| Serialization | `wikiEmbed` → `![[...]]` | `image` → `![...](...)` |

**The conversion scenario:** When a `file_embed` node (wikilink image) is somehow not recognized by the embed plugin during reparse, it falls through as plain text `![[image.png]]`. If another plugin or the remark parser picks it up, it may be reinterpreted as a malformed standard markdown image.

**Path escaping issue:** `to_markdown_asset_target()` in `file_drop_plugin.ts` calls `encodeURIComponent()` on each path segment. If `6_BLOB/2026-04-17_1703.png` goes through this encoding, underscores and hyphens survive, but the `/` handling and decode/re-encode cycle could produce a broken path. The `decodeURIComponent()` in `image_extension.ts:59` expects encoded input — if the path was stored unencoded (from wikilink), decoding a literal path is a no-op, but if it was partially encoded, it creates a mismatch.

**Document structure breaking with `!` prefix:** The `!` before a standard link creates an image node. If the remark parser encounters `![](broken_path)` in a context it doesn't expect (e.g., inside a list item with complex nesting), the resulting MDAST may be malformed, causing ProseMirror to receive an invalid document structure.

### Key Files
| File | Role |
|------|------|
| `src/lib/features/editor/adapters/file_embed_plugin.ts` | Wikilink `![[...]]` detection |
| `src/lib/features/editor/adapters/pm_to_mdast.ts:272-306` | Serialization for both types |
| `src/lib/features/editor/adapters/mdast_to_pm.ts:62-70` | Parsing standard images |
| `src/lib/features/editor/adapters/image_input_rule_plugin.ts` | Markdown image regex detection |
| `src/lib/features/editor/adapters/remark_plugins/remark_processor.ts` | Remark pipeline |

### Implementation Plan

1. **Trace the exact reparse path** that converts `![[image.png]]` to `![](image.png)`. Add logging at the serialization boundary (`pm_to_mdast.ts`) to confirm what node type is being serialized.
2. **Ensure `file_embed` nodes survive the save/reload cycle.** Check if `wikiEmbed` nodes in MDAST are round-tripped correctly through the remark processor (stringify → parse).
3. **Fix path encoding mismatch.** Standardize: wikilink paths should be stored unencoded; standard markdown paths should be URI-encoded. Decoding should happen at the resolution layer, not at the storage layer.
4. **Investigate the `!` document breaking.** Reproduce with a minimal document. Likely a remark plugin interaction — check if `remark-gfm` or custom remark plugins choke on image nodes in certain list contexts.

---

## Bug 3: Resizable Codeblock Hiding Behavior

### Symptoms
- If codeblock size is less than some threshold, invisible section appears after the codeblock
- Invisible section disappears when block is extended
- Reproduction: place codeblock in numbered list, try to add entries after it → hidden content

### Root Cause Analysis

**File:** `src/lib/features/editor/adapters/code_block_view_plugin.ts`

The `CodeBlockView` class uses `pre.style.height` for resize. Minimum height is 48px. When the code content is shorter than the set height, the `<pre>` element has empty space. When content is taller than the set height, `overflow: auto` applies and content scrolls.

**The bug is likely CSS-related:** When a codeblock is inside a list item and has a fixed height smaller than the natural content height, the list item's layout may clip or hide subsequent siblings. The `<pre>` element's `overflow` style combined with the list item's layout model can create a situation where content after the codeblock occupies space but isn't visually rendered.

**Key detail:** `apply_height()` removes `max-height` and sets `height`. If the surrounding list context uses `overflow: hidden` (common for collapsible containers), the fixed height of the `<pre>` may not properly influence the list item's computed height.

### Implementation Plan

1. **Reproduce in dev tools.** Inspect the computed layout of the list item containing the codeblock. Check if `overflow`, `position`, or `contain` on ancestor elements clips the subsequent content.
2. **Fix likely in CSS.** The codeblock's container within a list item may need explicit height recalculation. Consider using `min-height` instead of `height` for the `<pre>` to allow it to grow.
3. **Related enhancement:** Making more nodeviews collapsible (mentioned in report). This is a separate feature, not a bugfix.

---

## Bug 4: Table Toolbar Z-Index / Persistence

### Symptoms
- Table toolbar blocks other UI (sidebar, main toolbar) when focused
- Focus behavior is "slightly too persistent" — toolbar stays visible when it shouldn't

### Root Cause Analysis

**File:** `src/lib/features/editor/adapters/table_toolbar_plugin.ts`

The toolbar uses `Z_TABLE_TOOLBAR = 50` (from `floating_toolbar_utils.ts`). Positioning uses floating-ui with `offset(8)`, `flip()`, `shift({padding: 8})`.

**Focus persistence:** The toolbar listens to `focusout` and checks if `relatedTarget` is within the toolbar itself. If focus moves to the sidebar or main toolbar, the `relatedTarget` check may not detect the move correctly (especially if the sidebar uses a different focus context or shadow DOM).

**Z-index conflict:** Z-index 50 likely overlaps with sidebar or other floating elements. The backdrop overlay (z-index 0) is designed to dismiss on click, but if the sidebar or toolbar captures the click before the backdrop, the dismiss never fires.

### Implementation Plan

1. **Audit z-index stack.** Map all z-index values across the app (sidebar, toolbar, modals, table toolbar). Ensure table toolbar is below sidebar toggle and main toolbar.
2. **Fix dismiss logic.** Instead of relying solely on `focusout` + `relatedTarget`, add a global click listener that dismisses the table toolbar when clicking outside the editor area.
3. **Consider using a shared floating toolbar manager** that ensures only one floating toolbar is visible at a time.

---

## Bug 5: Task Checkbox Reverts to Bullet After Multiple Toggles

### Symptoms
- First check/uncheck works fine in both directions
- Unchecking multiple times reverts task items to bullet points
- Suspected remark/mdast parsing issue

### Root Cause Analysis

**Files:**
- `src/lib/features/editor/adapters/task_keymap_plugin.ts` — click handler
- `src/lib/features/editor/adapters/task_decoration_plugin.ts` — visual decorations

The task system has **dual attributes** (legacy + new):
- `checked` (boolean | null): `true` = done, `false` = todo, `null` = not a task
- `task_status` (string | null): `"todo"` / `"doing"` / `"done"` / `null`

**Status cycling:** `todo` → `doing` → `done` → `todo`

**The likely bug:** When toggling, if the code sets `checked = null` (intended to mean "not checked"), the serializer may interpret `null` as "not a task item" and serialize it as a plain bullet. The interaction between the two attribute systems creates edge cases where:
1. User unchecks (done → todo): sets `task_status = "todo"`, `checked = false` ✓
2. User unchecks again (todo → ...): cycling hits a state where `checked = null` and `task_status = null`
3. On next save/reparse, the list item has no task indicators → rendered as bullet

**Remark side:** The markdown serializer likely checks `checked` to decide between `- [ ]` (task) and `- ` (bullet). If `checked` is `null`, the serializer writes a plain bullet.

### Implementation Plan

1. **Trace the exact state transitions** during multiple toggles. Log `checked` and `task_status` after each click.
2. **Unify on `task_status` only.** The dual-attribute system is the root cause. Deprecate `checked` in favor of `task_status` everywhere — schema, serializer, parser.
3. **Guard the cycle.** Ensure the cycling function never produces a state where both attributes are `null` for a node that was previously a task item.
4. **Test:** Write a unit test that cycles a task item through all states multiple times and verifies the markdown output remains a task list item.

---

## Bug 6: Git History Hanging for Single Document

### Symptoms
- Loading git history for a single document hangs
- No clear way to revert git changes from sidebar

### Root Cause Analysis

**File:** `src/lib/features/git/application/git_service.ts`

`load_history(note_path, limit)` calls `git_port.log(vault_path, note_path, limit)`. This executes a `git log --follow <file>` command on the backend.

**Potential causes of hanging:**
1. **Large git history.** If the vault has thousands of commits touching the file (e.g., autocommit on every save), the `git log` command takes a long time. The `limit` parameter may not be passed to the backend correctly.
2. **`--follow` with renames.** If the file was renamed multiple times, `git log --follow` can be slow as it traces rename history.
3. **Lock contention.** If another git operation (autocommit, checkpoint) is running concurrently, the git process may wait for the lock file.
4. **No timeout.** The Tauri command likely has no timeout, so a slow git operation blocks indefinitely.

### Implementation Plan

1. **Check the Rust backend** for the `git log` command implementation. Verify `limit` is passed as `--max-count=N`.
2. **Add a timeout** to the git history command (e.g., 10s). Surface a user-friendly error on timeout.
3. **Check for lock contention.** If `is_loading_history` is already true, don't issue another request.
4. **Revert UX:** Add a "restore this version" button to the history view that calls `git_port.checkout_file(commit_hash, file_path)`.

---

## Bug 7: Dropped Images Can't Be Resized

### Symptoms
- Dropped images use standard markdown syntax (`![](path)`), not wikilink
- These images can't be resized

### Root Cause Analysis

**File:** `src/lib/features/editor/domain/file_drop_plugin.ts`

`build_file_link()` generates `![label](relative_path)` for dropped images. This creates an `image` or `image-block` node (after block promotion).

**The `image-block` node has `width` and `ratio` attrs** but the nodeview in `image_extension.ts:100-154` only applies `wrapper.style.width` if the width attr is already set. There's no resize handle or drag-to-resize behavior in the nodeview — unlike `file_embed` (wikilink images) which have the collapsible/resize toolbar from `file_embed_view_plugin.ts`.

**So:** Dropped images → standard syntax → `image-block` → no resize UI. Wikilink images → `file_embed` → toolbar with resize. The two nodeviews have different capabilities.

### Portability Consideration

Standard markdown images (`![alt](path)`) render in any markdown viewer (GitHub, VS Code preview, pandoc, static site generators). Wikilink images (`![[path]]`) render in apps that support wikilink syntax (Carbide, Obsidian, Logseq) but **not** in plain markdown renderers. The portability tradeoff only matters if vaults are consumed outside wikilink-aware tools.

### Implementation Plan

**Two changes:**

1. **Add resize to `image-block` nodeview.** Port the pointer-drag resize logic from `code_block_view_plugin.ts`. The `width` and `ratio` attrs already exist on the schema — the nodeview just needs a resize handle that updates them via `setNodeMarkup()`. This ensures standard-syntax images are fully functional.

2. **Add vault setting `image_drop_format: "standard" | "wikilink"` (default: `"standard"`).** Controls whether `build_file_link()` in `file_drop_plugin.ts` emits `![](path)` or `![[path]]` for dropped/pasted images. Users who want the `file_embed` toolbar UX (collapse, type indicator) can opt into wikilinks; portability-conscious users keep the default.

   - Setting lives in vault settings (per-vault, not global) — different vaults may have different portability needs
   - `image_paste_plugin.ts` should also respect this setting
   - Surface in Settings UI under Editor → Images

---

## Bug 8: Vault Spinning Wheel on Cross-Machine Open

### Symptoms
- ~10s spinning wheel on first open after switching machines
- Only happens the first time after the vault was used on a different machine
- Vault synced via iCloud (but provider shouldn't matter)

### Root Cause Analysis

This is likely caused by the **linked source verification + rescan** sequence in the startup reactor:

```
verify_linked_sources() → rescan_all_enabled_sources()
```

On a new machine:
1. `verify_linked_sources()` resolves `home_relative_path` for each source → triggers filesystem access for each source directory
2. If paths changed, it **self-heals** (updates paths + saves) → write operations to vault settings
3. `rescan_all_enabled_sources()` re-scans all enabled sources → heavy filesystem I/O

Additionally:
- **SQLite FTS index rebuild.** If the search database was built on machine A with different file timestamps, machine B may detect staleness and rebuild.
- **File watcher setup.** Re-establishing file watchers on a vault whose files all have "new" mtimes (from sync) triggers a burst of change events.
- **Git status check.** If autocommit is enabled, the initial git status on a freshly synced vault (thousands of changed mtimes) can be slow.

### Implementation Plan

1. **Profile the startup.** Add timing logs to each phase: vault load, linked source verify, search index check, file watcher setup, git status.
2. **Lazy-load linked sources.** Don't verify/rescan on startup. Defer to when the user actually accesses reference features.
3. **Batch file watcher events.** If the watcher receives >100 events within 1s of vault open, debounce and process as a single "vault refresh" rather than individual file updates.
4. **Cache invalidation strategy.** Store a vault fingerprint (e.g., hash of top-level file list) and only trigger heavy re-indexing when the fingerprint changes.

---

## Priority Matrix

| Bug | Severity | Effort | Priority |
|-----|----------|--------|----------|
| 1. CLI hangs on startup | **High** (blocks app usage) | Medium | **P0** |
| 2. Images break after reparse | **High** (data corruption) | High | **P0** |
| 5. Tasks revert to bullets | **Medium** (data loss on toggle) | Medium | **P1** |
| 6. Git history hanging | **Medium** (feature broken) | Low | **P1** |
| 7. Dropped images not resizable | **Low** (missing feature) | Low | **P2** |
| 3. Codeblock hiding | **Low** (visual glitch) | Low | **P2** |
| 4. Table toolbar z-index | **Low** (visual annoyance) | Low | **P2** |
| 8. Vault switch delay | **Low** (perf, first-time only) | Medium | **P2** |

---

## Dependencies & Grouping

- **Bugs 1 + 8** share root cause in startup sequence (linked source verification). Fixing the startup flow addresses both.
- **Bugs 2 + 7** both involve the wikilink vs standard image duality but have **independent fixes**: Bug 2 is a remark round-trip issue; Bug 7 is a missing resize handle on `image-block`. No need to unify the two systems — fix each independently to preserve markdown portability.
- **Bug 5** is standalone (task attribute system).
- **Bugs 3 + 4** are CSS/UI polish items that can be batched.
- **Bug 6** is a standalone backend fix.

---

## Implementation Phases

Each phase is scoped to fit in a single conversation session. Phases are ordered by priority and dependency.

### Phase 1 — Startup Flow (Bugs 1 + 8)

**Goal:** App starts without hanging, regardless of launch method or linked source state.

1. **Trace the blocking path.** Read the reactor, verify whether the `$effect` awaits the dialog or gates downstream work. Identify exactly what blocks.
2. **Decouple dialog from startup.** Make `verify_linked_sources()` populate `missing_linked_sources` in the store without blocking. The dialog should appear reactively once the UI is mounted.
3. **Profile cross-machine startup.** Add timing instrumentation to each startup phase (vault load, linked source verify, search index, file watcher, git status). Identify the dominant cost.
4. **Defer heavy work.** Move `rescan_all_enabled_sources()` out of the critical startup path — trigger it after the editor is interactive (e.g., on idle or first reference panel open).
5. **Verify:** CLI launch with a missing linked source should open without hanging. Cross-machine open should not spin for >2s.

**Deliverables:** Fix to reactor + reference service startup sequence, timing logs (removable after profiling).

### Phase 2 — Image Reparse Integrity (Bug 2)

**Goal:** Wikilink images survive the save/reload cycle without corruption.

1. **Reproduce.** Create a test note with `![[6_BLOB/image.png]]`, save, reload, inspect the markdown output. Confirm the conversion to `![](...)`.
2. **Trace the round-trip.** Add logging at `pm_to_mdast.ts` serialization and `mdast_to_pm.ts` parsing. Identify where `file_embed` → `wikiEmbed` is lost or reinterpreted.
3. **Fix remark round-trip.** Ensure `wikiEmbed` nodes in MDAST survive stringify → parse. Likely needs a remark plugin that preserves `![[...]]` as an opaque token rather than letting it be reinterpreted.
4. **Fix path encoding.** Standardize: wikilink paths stored unencoded, standard paths URI-encoded. Decoding at resolution layer only.
5. **Test the `!` + standard link document breaking.** Reproduce with a minimal doc, identify which remark plugin interaction causes structure loss.
6. **Write tests.** Round-trip tests for both image types through the full serialize → parse → serialize cycle.

**Deliverables:** Remark round-trip fix, path encoding fix, regression tests.

### Phase 3 — Task Checkbox Stability (Bug 5)

**Goal:** Task items never revert to bullets regardless of toggle count.

1. **Trace state transitions.** Log `checked` and `task_status` attrs after each click in `task_keymap_plugin.ts`. Identify the exact toggle sequence that produces `null`/`null`.
2. **Unify on `task_status`.** Remove `checked` as the source of truth. `task_status` should be the single attribute controlling task identity. `checked` can remain for backward compat parsing (read-only) but should not be written.
3. **Guard serialization.** In the markdown serializer, ensure a node that has ever been a task (has `task_status`) always serializes as `- [ ]` / `- [x]` / `- [/]`, never as `- `.
4. **Write tests.** Cycle a task through `todo → doing → done → todo → doing → done` and verify markdown output at each step.

**Deliverables:** Unified task attribute, serializer guard, cycle tests.

### Phase 4 — Git History + Image Resize (Bugs 6 + 7)

**Goal:** Git history loads reliably; dropped images can be resized.

**Bug 6 — Git history:**
1. Check Rust backend for `git log` command. Verify `--max-count` is passed.
2. Add a 10s timeout to the Tauri command. Surface error on timeout.
3. Add guard: if `is_loading_history` is already true, don't re-issue.
4. Verify with a vault that has many commits to a single file.

**Bug 7 — Image resize + drop format setting:**
1. Add pointer-drag resize handle to `image-block` nodeview (port from `code_block_view_plugin.ts`). Update `width` attr via `setNodeMarkup()`.
2. Add vault setting `image_drop_format: "standard" | "wikilink"` (default: `"standard"`).
3. Wire setting into `build_file_link()` in `file_drop_plugin.ts` and `image_paste_plugin.ts`.
4. Add setting to UI under Settings → Editor → Images.
5. Test: drop image with each setting, verify syntax and resize behavior.

**Deliverables:** Git history timeout + guard, image-block resize handle, `image_drop_format` vault setting.

### Phase 5 — Editor Polish (Bugs 3 + 4)

**Goal:** Codeblock and table toolbar visual issues resolved.

**Bug 3 — Codeblock hiding:**
1. Reproduce: codeblock inside numbered list, shrink below content height.
2. Inspect computed layout in dev tools. Identify the CSS property causing clipping (likely `overflow` on a list ancestor).
3. Fix: likely `min-height` instead of `height` on `<pre>`, or explicit height propagation to the list item container.
4. Test in multiple list nesting scenarios.

**Bug 4 — Table toolbar z-index:**
1. Audit z-index values across the app (sidebar, toolbar, modals, table toolbar).
2. Adjust `Z_TABLE_TOOLBAR` relative to sidebar/main toolbar.
3. Fix dismiss logic: add global click listener or use `pointerdown` outside editor area to dismiss.
4. Test: open table toolbar, click sidebar, verify toolbar dismisses.

**Deliverables:** CSS fixes for codeblock layout, z-index/dismiss fixes for table toolbar.

### Phase Summary

| Phase | Bugs | Est. Scope | Branch |
|-------|------|------------|--------|
| 1 | 1, 8 | Startup reactor + service refactor | `fix/startup-flow` |
| 2 | 2 | Remark round-trip + path encoding | `fix/image-reparse` |
| 3 | 5 | Task attribute unification | `fix/task-toggle` |
| 4 | 6, 7 | Git timeout + image resize + setting | `feat/image-resize-git-history` |
| 5 | 3, 4 | CSS/UI polish | `fix/editor-polish` |
