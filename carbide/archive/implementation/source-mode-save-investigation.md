# Source Mode Save Bug — Deep Investigation

## Bug Summary

**Symptom:** Source-mode edits are lost on tab switch, even after saving. The file on disk has the correct content, but switching away and back shows stale (pre-edit) content. Closing the tab and reopening shows correct content.

**Root cause:** Visual editor properly saves dirty state because ProseMirror has a persistent `buffer_map` cache. Source editor (CodeMirror) has NO equivalent cache — it is destroyed and recreated on every tab switch via `{#key open_note.meta.id}`. Its content comes entirely from `open_note.markdown` at mount time.

---

## Architecture Overview

### Key Files

| File | Role |
|------|------|
| `src/lib/features/editor/ui/source_editor_content.svelte` | CodeMirror instance, dirty tracking, `$effect.pre` sync |
| `src/lib/features/editor/ui/note_editor.svelte` | Mounts both visual (ProseMirror) and source (CM) editors |
| `src/lib/features/editor/state/editor_store.svelte.ts` | Central reactive state (`open_note`, `editor_mode`, `source_content_getter`) |
| `src/lib/features/editor/application/editor_service.ts` | `flush()`, `open_buffer()`, `mark_clean()` |
| `src/lib/features/editor/adapters/prosemirror_adapter.ts` | ProseMirror session, `buffer_map` cache, `open_buffer()`, `on_markdown_change` |
| `src/lib/features/tab/application/tab_action_helpers.ts` | `capture_active_tab_snapshot`, `open_active_tab_note` |
| `src/lib/features/note/application/note_service.ts` | `save_note`, `open_note`, `sync_flushed_markdown` |
| `src/lib/reactors/editor_sync.reactor.svelte.ts` | Watches `open_note` changes, calls `editor_service.open_buffer()` |
| `src/lib/features/editor/domain/source_editor_sync.ts` | `sync_source_editor_markdown` — decides when to push store content into CM |

### Data Flow: Source Mode Edit → Save → Tab Switch → Return

```
User types in source mode
  → CM update listener fires immediately
    → on_dirty_change(true)         → editor_store.open_note.is_dirty = true
    → debounce 50ms
      → on_markdown_change(content) → editor_store.open_note.markdown = content
  → ProseMirror is HIDDEN but still mounted. Its current_markdown is NEVER updated.

User presses Cmd+S
  → note_service.save_note
    → sync_flushed_markdown → editor_service.flush()
      → source_content_getter() reads live CM doc
      → set_markdown in store (correct content)
      → normalize_markdown_line_breaks
    → write_existing_note → writes open_note.markdown to disk ✓
    → editor_store.mark_clean() → is_dirty = false
    → editor_service.mark_clean() → PM session.mark_clean(markdown)
      → saved_markdown = "new content"
      → current_is_dirty = false
      → BUT current_markdown STILL = "old content" (PM was never synced!)

User switches to Tab B
  → capture_active_tab_snapshot:
    → flush() reads CM content → set_markdown (redundant, already correct)
    → open_note.is_dirty = false (saved) → clear_cached_note(A) → NO cache
  → stores.tab.activate_tab(B)
  → open_active_tab_note(B) → loads B from disk → set_open_note(B)
  → editor_sync_reactor fires (note id changed):
    → editor_service.open_buffer(B, "reuse_cache")
    → PM open_buffer:
      → save_current_buffer() for A → buffer_map[A] = { markdown: "old content" } ← STALE!
      → Opens B's buffer
  → {#key} destroys CM for A, creates CM for B

User switches back to Tab A
  → capture_active_tab_snapshot for B
  → open_active_tab_note(A):
    → No cache → services.note.open_note(A.path) → reads from disk → "new content"
    → set_open_note({ markdown: "new content", is_dirty: false })
  → editor_sync_reactor fires:
    → editor_service.open_buffer(A, "reuse_cache")
    → PM open_buffer:
      → Cache check: buffer_map[A].markdown ("old content") vs initial_markdown ("new content")
      → MISMATCH → cache invalidated (fix from e7c06d91) → parses fresh ✓
      → on_markdown_change(PM_serialized_markdown) → set_markdown in store
  → {#key} creates new CM with initial_markdown = open_note.markdown
```

---

## Critical Finding: ProseMirror `on_markdown_change` Overwrites Store

**This is the most likely root cause.**

When `editor_sync_reactor` calls `open_buffer`, ProseMirror ALWAYS fires `on_markdown_change(current_markdown)` at the end (line 828 of `prosemirror_adapter.ts`). This calls `editor_store.set_markdown()` with the **ProseMirror-serialized** markdown.

ProseMirror round-trips markdown through `parse_markdown()` → ProseMirror doc → serialization. This is **not identity** — the round-tripped markdown can differ from the original. If the source-mode edits produced markdown that ProseMirror normalizes differently, the `on_markdown_change` callback pushes the PM-normalized version into the store.

The source editor's `$effect.pre` then detects `store_markdown !== current_content` and **replaces CM content with the PM-normalized version**.

**The timing is:**
1. `set_open_note(note_from_disk)` — store has correct "new content"
2. DOM update: `{#key}` creates CM with `initial_markdown = "new content"` ✓
3. `$effect` (editor_sync_reactor): PM `open_buffer` → `on_markdown_change(PM_roundtripped)` → `set_markdown`
4. `$effect.pre` (source editor sync): detects store changed → replaces CM content with PM version

If PM round-trip is lossy for the user's specific markdown, content is degraded or lost.

---

## Second Bug: `mounted_markdown_change` Closure Reads Stale `open_note`

In `source_editor_content.svelte`, `onDestroy` flushes pending debounce:

```ts
// line 291
(mounted_markdown_change ?? on_markdown_change)(get_content());
```

The `on_markdown_change` callback is:
```ts
(md) => stores.editor.set_markdown(open_note.meta.id, as_markdown_text(md))
```

`open_note` is `$derived(stores.editor.open_note)` — a reactive getter. By the time `onDestroy` runs (after DOM update), `open_note` has already changed to the NEW tab's note. So this writes Tab A's CM content into Tab B's store slot, **corrupting Tab B**.

The `mounted_markdown_change` capture at mount time was intended to fix this (commit `ba045b43`), but it captures the same closure that reads the reactive `$derived` getter at call time, so it doesn't actually help.

---

## Assessment of Regression Review Hypotheses

### `8d27515b` — Frontmatter guard `filterTransaction` (Priority 1 in review)

**VERDICT: Not the cause.** Both programmatic transactions in `prosemirror_adapter.ts` (lines 543 and 589) correctly set `addToHistory: false`. The `SKIP_FRONTMATTER_GUARD` meta was also added by commit `b0d0558b`. The guard will not silently reject source→visual sync transactions.

### `ba045b43` — `mounted_markdown_change` stale closure (Priority 1 in review)

**VERDICT: Real bug, but affects WRONG tab.** The closure captures a reactive `$derived` reference, not a static value. During `onDestroy`, it reads the NEW tab's note id, not the old one. This corrupts the new tab, not the old one. This is a real bug but doesn't explain data loss on the SOURCE tab — it could explain data loss on the DESTINATION tab.

### `ba045b43` — `source_content_getter` cleared in `reset()` (Priority 1 in review)

**VERDICT: Low risk for tab switching.** `reset()` is only called during vault open/close, not during tab switches. The `clear_source_content_getter()` in `onDestroy` runs AFTER `capture_active_tab_snapshot` has already called `flush()` (which reads `source_content_getter` while it's still valid).

### `970c27a9` — Removed `mark_clean` from wiki_link_plugin (Priority 1 in review)

**VERDICT: Not the cause.** The removed `mark_clean` meta dispatch was vestigial — the callback it triggered was a no-op. Removing it has no effect on dirty state tracking.

### `e7c06d91` — ProseMirror buffer cache invalidation fix

**VERDICT: Correct fix, but incomplete.** The cache IS properly invalidated when the cached markdown diverges from `initial_markdown`. However, the fundamental issue is that ProseMirror `on_markdown_change` fires after cache invalidation and pushes PM-round-tripped markdown into the store, which can differ from the source editor's content.

---

## Root Cause Hypothesis (Ordered by Likelihood)

### 1. ProseMirror `on_markdown_change` overwrites source editor content

When switching back to a tab in source mode, the `editor_sync_reactor` opens the PM buffer, which fires `on_markdown_change` with PM-serialized markdown. This overwrites `open_note.markdown` in the store. If the PM round-trip changes the markdown (very likely for any non-trivial content), the source editor's `$effect.pre` replaces CM content with the PM version.

**Fix:** When in source mode, either:
- Don't call `open_buffer` on ProseMirror (skip the editor_sync_reactor when mode is source)
- Suppress the `on_markdown_change` callback from `open_buffer` when in source mode
- Have the source editor ignore store updates that came from PM (not from user action)

### 2. `current_markdown` in ProseMirror is never synced from source mode edits

ProseMirror's `current_markdown` (the adapter's internal variable, NOT the PM doc) retains the pre-source-edit content. When `save_current_buffer()` is called during tab switch, it caches this stale `current_markdown`. While the `e7c06d91` fix invalidates stale cache entries, the fresh parse from `initial_markdown` is still round-tripped through PM, which may normalize it differently.

**Fix:** When `flush()` is called in source mode, also update ProseMirror's `current_markdown` to match (without re-parsing the doc). Or sync PM's markdown whenever source mode edits update the store.

### 3. `mounted_markdown_change` corrupts destination tab

Not the reported bug (Tab A data loss) but a real bug that corrupts Tab B's store content during Tab A's CM `onDestroy`.

**Fix:** Capture `open_note.meta.id` as a local constant at mount time, not as a reactive reference:
```ts
// In onMount, capture the note id:
const mounted_note_id = open_note.meta.id; // capture VALUE, not reactive ref
mounted_markdown_change = (md: string) =>
  stores.editor.set_markdown(mounted_note_id, as_markdown_text(md));
```

---

## Recommended Fix Strategy

### Immediate Fix (addresses root cause #1)

In `editor_sync.reactor.svelte.ts`, suppress `open_buffer` when in source mode (the PM editor is hidden and doesn't need updating):

```ts
$effect(() => {
  const open_note = editor_store.open_note;
  const mode = editor_store.editor_mode;
  // ...
  if (!should_open) return;

  // In source mode, PM is hidden — don't open buffer (avoids on_markdown_change overwrite)
  // PM buffer will be synced when switching back to visual mode
  if (mode === "source" && !editor_store.split_view) {
    // Still update active_note so flush() works
    editor_service.set_active_note(open_note);
    return;
  }

  editor_service.open_buffer(open_note, restore_policy);
});
```

This requires adding a `set_active_note` method to `editor_service.ts` that updates `this.active_note` without calling `session.open_buffer()`.

### Complementary Fix (addresses root cause #3)

In `source_editor_content.svelte` `onMount`, capture the note id by value:

```ts
const mounted_note_id = stores.editor.open_note?.meta.id;
mounted_markdown_change = mounted_note_id
  ? (md: string) => stores.editor.set_markdown(mounted_note_id, as_markdown_text(md))
  : on_markdown_change;
```

### Defensive Fix (addresses root cause #2)

In `editor_service.flush()`, after reading source content and updating the store, also update ProseMirror's `current_markdown` tracking variable. This could be done via a new method on the session handle like `sync_markdown_tracking(markdown)` that updates `current_markdown` and `saved_markdown` without dispatching transactions.

---

## Test Scenarios

1. **Save-and-switch:** Edit in source mode → Cmd+S → switch tab → switch back → edits visible
2. **Dirty-and-switch (autosave ON):** Edit in source mode → switch tab → switch back → edits visible
3. **Dirty-and-switch (autosave OFF):** Edit in source mode → switch tab → switch back → edits visible + dirty indicator
4. **Rapid switch:** Edit in source mode → switch tab within 50ms → switch back → edits visible
5. **Cross-mode:** Edit in source mode → switch to visual → switch back to source → edits visible
6. **Tab B integrity:** Edit Tab A in source mode → switch to Tab B → verify Tab B content not corrupted
7. **PM round-trip:** Edit markdown with features PM normalizes (raw HTML, indented code, link references) in source mode → switch tabs → verify source content unchanged
