# Source Mode Save Regression Review — Last 100 Commits

Review of the last 100 commits for potential regressions in the source mode editor's ability to save changes.

---

## Priority 1 — HIGH RISK

### `8d27515b` — Fix frontmatter loss: guard selectAll and reject frontmatter deletion

**Files changed:** `frontmatter_guard_plugin.ts`, `frontmatter_guard.test.ts`, `frontmatter_roundtrip.test.ts`

**Risk: `filterTransaction` could block programmatic doc replacements during source→visual sync.**

The `filterTransaction` guard rejects any transaction that removes frontmatter **unless** `addToHistory === false`. This was designed for user-initiated edits, but the source→visual roundtrip works by: (1) flush reads source CM content, (2) sets markdown into the store, (3) visual editor receives the markdown and dispatches transactions on ProseMirror. If any of those internal transactions don't carry `addToHistory: false` but produce a doc where frontmatter is temporarily absent (e.g., during full-doc replacement), they'll be silently rejected — **the visual editor won't update, and the user's save silently drops changes**.

The test at `frontmatter_guard.test.ts:69` covers the `addToHistory: false` path, but `replace_doc_undoable` and `apply_markdown_diff` in `prosemirror_adapter.ts` need verification that they always set `addToHistory: false`.

---

### `ba045b43` — fix: editor roundtrip bugs 1-7 — tab switch, undo history, cursor, dirty state

**Files changed:** `app_actions.ts`, `prosemirror_adapter.ts`, `editor_service.ts`, `editor_store.svelte.ts`, `source_editor_content.svelte`, `note_editor.svelte`

**Risk: Two fragile fixes in the source editor save path.**

- **Bug 1:** `mounted_markdown_change` captures `on_markdown_change` at mount time to ensure `onDestroy` flushes to the correct note. If the prop value changes dynamically (e.g., tab switch during teardown), the stale closure writes to the wrong note.
- **Bug 5:** `source_content_getter` is cleared in `EditorStore.reset()`. If `reset()` is called before `onDestroy` finishes its timer flush, the getter returns `null` and `flush()` short-circuits — **last keystrokes could be lost on save**.

---

### `970c27a9` — Remove vestigial mark_clean from wiki_link_plugin

**Files changed:** `wiki_link_plugin.ts`, `reference_service.ts`, tests

**Risk: Dirty state tracking change.**

Removed `tr.setMeta(dirty_state_plugin_key, { action: "mark_clean" })` from wiki link's `appendTransaction`. The commit message states this was inert (the callback was a no-op), but if `dirty_state_plugin` ever processed this meta to re-evaluate cleanliness, removing it could cause the visual editor to stay "dirty" after wiki link normalization — preventing the save button from deactivating or causing false "unsaved changes" prompts.

---

## Priority 2 — MEDIUM RISK

### `b2cf8a5b` — Sprint 1: insert_text now calls set_dirty

**Files changed:** `editor_service.ts`, `formatting_toolbar_commands.ts`, `db.rs`, bug reports

Added `set_dirty(id, true)` to `insert_text()`. If `insert_text` is called during source mode (e.g., by an AI or command), the dirty flag now fires — previously it didn't. This is the intended fix, but it means the dirty-state plugin's own tracking could conflict with this manual `set_dirty` call if both visual and source editors are open in split view.

### `5c57eb38` — Fix: editor bugs 001-004 (BUG-002: source editor onDestroy flush ordering)

**Files changed:** `source_editor_content.svelte`, `frontmatter_guard_plugin.ts`, others

Moved `clear_source_content_getter` to **after** the pending timer flush in `onDestroy`. This is correct, but the current code at `source_editor_content.svelte:289-294` still has this ordering. If a refactor moves `clear_source_content_getter` back before the flush, the same bug returns.

### `c7daff70` — Add Tab/Shift-Tab indent behavior to both editors

**Files changed:** `core_extension.ts`, `source_editor_content.svelte`

Added `indentWithTab` to source editor CodeMirror extensions. Low regression risk, but worth noting that if Tab is intercepted before CodeMirror, source editor indentation silently fails.

---

## Priority 3 — LOW RISK

### `cf16e032` — Clipboard entity decode in prosemirror_adapter

Only affects the clipboard path (`get_clipboard_text`), not the save path. No save regression.

### `76396791` — LSP coexistence: block ref handoff, hover panel, Cmd+.

Only touches hover/completion wiring and editor_service event ports. Doesn't modify flush, `source_content_getter`, or dirty state.

### `8e0dba09` — Cmd+. triggers LSP hover at cursor

Adds `trigger_hover_at_cursor()` method to EditorService. No interaction with the save path.

### `069a2ef0` — Heading autocomplete in wiki links

Changes `handle_wiki_suggest_query` signature from `(string)` to `(WikiQueryEvent)`. No interaction with the save pipeline.

---

## Key Finding

**`8d27515b` (frontmatter guard filterTransaction) is the highest-risk commit.** If any code path that updates the visual editor during source→visual sync dispatches ProseMirror transactions without `addToHistory: false`, those transactions will be silently filtered out, causing the visual editor to not reflect the source editor's saved content. Verify that `prosemirror_adapter.ts` lines 466 and 489 (which dispatch `replaceWith` and `setMeta`) always carry `addToHistory: false`.
