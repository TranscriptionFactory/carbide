## Editor Round-Trip Audit: Data Loss / Corruption Risks

### BUG 1 (Medium-High): Tab switch during source mode writes old content to new note's store slot

**Location**: `note_editor.svelte:99-103`, `note_editor.svelte:146-150`, `source_editor_content.svelte:283-286`

**Problem**: When the user switches tabs while in source mode, the SourceEditor's `{#key open_note.meta.id}` block destroys the old component. During `onDestroy`, if there's a pending debounced `store_timer` (within 50ms of last keystroke), it calls:

```ts
on_markdown_change(get_content()); // old CM content
```

The `on_markdown_change` callback in the parent template references `open_note.meta.id`, which is a `$derived` from the store. By the time `onDestroy` fires, the store already has the **new** note's ID. So old source content is written to the new note's markdown slot.

**Why it matters**: The subsequent `editor_sync.reactor` → `open_buffer()` overwrites the corruption, but there's a brief window where the store holds wrong content. If autosave were to fire during that window (extremely tight, but possible with very short debounce), it could persist the corruption.

**Fix**: Capture `open_note.meta.id` in a local variable when the SourceEditor mounts, and pass it via a non-reactive prop or closure, so `onDestroy` always references the original note ID.

---

### BUG 2 (Medium): Split view toggle destroys ProseMirror undo history

**Location**: `note_editor.svelte:78-119` vs `120-165`

**Problem**: The visual editor (`use:mount_editor`) lives in different Svelte `{#if}` branches for split vs non-split mode. Toggling split view causes Svelte to destroy the old branch and render the new one. This calls `app_editor_unmount` → `editor_service.unmount()` → `teardown_session()`, destroying the entire PM session and its undo history. When the new branch mounts, `app_editor_mount` → `editor_service.mount()` → `recreate_session()` creates a fresh session from the store markdown.

**Impact**: All undo/redo history is lost on split view toggle. User cannot Ctrl+Z back past a split view toggle.

**Fix**: Instead of two separate `use:mount_editor` directives in different DOM branches, use a single persistent editor DOM node that gets reparented, or keep the PM session alive across split view toggles and only re-attach the view.

---

### BUG 3 (Low-Medium): Source→visual mode switch doesn't restore cursor position in visual editor

**Location**: `app_actions.ts:365-374`

**Problem**: When switching visual→source, the action saves the cursor offset via `get_cursor_markdown_offset()`. But when switching source→visual, the action does:

```ts
services.editor.sync_visual_from_markdown(open_note.markdown);
services.editor.set_editable(true);
```

It never calls `set_cursor_from_markdown_offset()` to restore the cursor position. The visual editor cursor jumps to position 0 (or end of document depending on PM's replaceWith behavior).

**Fix**: In the `source` branch of `editor_toggle_mode`, capture the source editor's cursor offset before flush, then after `sync_visual_from_markdown`, call `services.editor.set_cursor_from_markdown_offset(offset)`.

---

### BUG 4 (Low): Round-trip normalization causes phantom dirty state on mode switch

**Location**: `prosemirror_adapter.ts:299-311`, `app_actions.ts:365-380`

**Problem**: When switching source→visual, `sync_visual_from_markdown()` calls `set_markdown()` in the PM adapter. PM parses the markdown into a doc, then the `create_markdown_change_plugin` serializes it back. If `serialize(parse(md)) !== md` (e.g., trailing whitespace trimmed, empty paragraphs stripped), `current_markdown` diverges from `saved_markdown`. The note is flagged dirty even though the user made no semantic changes. This triggers an unnecessary autosave with the normalized (slightly different) content.

**Impact**: Silent content normalization on every mode switch. The markdown file on disk subtly changes formatting each time the user round-trips through visual mode. Not data loss per se, but unexpected content mutation — problematic for git-tracked vaults.

**Fix**: After `sync_visual_from_markdown`, re-serialize from PM and use the PM-canonical form as the `saved_markdown` baseline.

---

### BUG 5 (Low): `EditorStore.reset()` doesn't clear `source_content_getter` and `cm_content_cache`

**Location**: `editor_store.svelte.ts:206-215`

**Problem**: `reset()` nulls out `open_note`, `cursor`, `selection`, etc., but leaves `source_content_getter` and `cm_content_cache` intact. If a vault is closed and reopened, or the editor is reset for other reasons, stale getters or cached content could persist. A stale `source_content_getter` pointing to a destroyed CodeMirror view would return `""` (due to `view?.` optional chaining), potentially causing empty content on flush.

**Fix**: Add `this.source_content_getter = null; this.cm_content_cache.clear();` to `reset()`.

---

### BUG 6 (Low): `cm_content_cache` is dead code — never read outside EditorStore

**Location**: `editor_store.svelte.ts:25-39`

**Problem**: `cm_content_cache`, `cache_cm_content()`, `get_cm_content_cache()`, and `clear_cm_content_cache()` are defined but never called by any other file. This is dead code. It also represents a design intent that was never completed — the cache was likely meant to persist source editor state across tab switches, similar to PM's `buffer_map`.

**Impact**: No functional issue, but adds cognitive overhead and the cache is never evicted (memory leak if it were used).

**Fix**: Remove the dead code, or implement the caching if needed for source editor tab restoration.

---

### BUG 7 (Low): `suppress_change_echo` is not exception-safe in `apply_markdown_diff` and `replace_doc_undoable`

**Location**: `prosemirror_adapter.ts:570-572`, `prosemirror_adapter.ts:600-602`

**Problem**: Both methods set `suppress_change_echo = true`, dispatch a PM transaction, then set it back to `false`. If `view.dispatch(tr)` throws (e.g., invalid transaction), `suppress_change_echo` stays `true` forever, permanently silencing markdown change notifications. All subsequent edits would be invisible to the store.

```ts
suppress_change_echo = true;
view.dispatch(tr); // if this throws...
suppress_change_echo = false; // ...this never runs
```

**Fix**: Wrap in try/finally:

```ts
suppress_change_echo = true;
try {
  view.dispatch(tr);
} finally {
  suppress_change_echo = false;
}
```

---

### Summary by severity

| #   | Bug                                                 | Severity    | Data Loss Risk                         |
| --- | --------------------------------------------------- | ----------- | -------------------------------------- |
| 1   | Tab switch writes old source content to new note ID | Medium-High | Yes (narrow window)                    |
| 2   | Split view toggle destroys undo history             | Medium      | Indirect (can't undo)                  |
| 3   | Source→visual cursor not restored                   | Low-Medium  | No                                     |
| 4   | Round-trip normalization phantom dirty              | Low         | Silent content mutation                |
| 5   | `reset()` doesn't clear getter/cache                | Low         | Potential empty content on stale flush |
| 6   | `cm_content_cache` dead code                        | Low         | None (cleanup)                         |
| 7   | `suppress_change_echo` not exception-safe           | Low         | Yes (if PM throws, edits invisible)    |

Bugs 1 and 7 have the clearest data-loss potential. Bug 2 has the highest user-facing impact for daily workflow. Bug 4 is the most insidious for git-tracked vaults. Want me to fix any of these?
