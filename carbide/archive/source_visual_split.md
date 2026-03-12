# Source / Visual Editor Mode Toggle

## Context

Otterly's editor is Milkdown (ProseMirror WYSIWYG) with no concept of editing mode. We want visual ↔ source (raw markdown) toggle, with split mode deferred. Moraya (sister project) has a battle-tested `SourceEditor.svelte` we can port.

**Key decisions:**

- SourceEditor writes directly to `EditorStore` (bypasses `EditorService`)
- `EditorService.flush()` becomes mode-aware (reads store in source mode, pulls from Milkdown in visual mode)
- `EditorMode = 'visual' | 'source' | 'split'` — only visual/source implemented now
- Port moraya's `SourceEditor.svelte` (Svelte 5 runes, same as otterly)

---

## Implementation Steps

### 1. Add `EditorMode` type

**New file:** `src/lib/features/editor/domain/editor_mode.ts`

```ts
export type EditorMode = "visual" | "source" | "split";
```

### 2. Extend `EditorStore` with mode + cross-mode state

**Modify:** `src/lib/features/editor/state/editor_store.svelte.ts`

Add fields:

- `editor_mode: EditorMode = $state<EditorMode>("visual")`
- `cursor_offset: number = $state(0)` — character offset for cross-mode cursor restore
- `scroll_fraction: number = $state(0)` — 0..1 scroll position fraction

Add methods:

- `set_editor_mode(mode: EditorMode)` — no-op if same
- `toggle_editor_mode()` — toggles visual ↔ source
- `set_cursor_offset(offset: number)`
- `set_scroll_fraction(fraction: number)`

Update `reset()` to clear these fields.

### 3. Extract heading parser as pure domain function

**New file:** `src/lib/features/editor/domain/extract_headings.ts`

Port moraya's `extractHeadingsFromMarkdown` — scans markdown lines for ATX headings (`# ` through `###### `), returns `OutlineHeading[]`. Used by source editor to feed the outline store (replacing Milkdown's `outline_plugin` which only works in visual mode).

**Reuse:** `OutlineHeading` type from `$lib/features/outline`.

### 4. Build `SourceEditor` component

**New file:** `src/lib/features/editor/ui/source_editor.svelte`

Port from `/Users/abir/src/moraya/src/lib/editor/SourceEditor.svelte` (~435 lines), adapting to otterly conventions:

**Props:**

```ts
{
  initial_markdown: string;
  on_markdown_change: (markdown: string) => void;
  on_dirty_change: (is_dirty: boolean) => void;
  on_cursor_change: (info: CursorInfo) => void;
  on_outline_change?: (headings: OutlineHeading[]) => void;
}
```

**Port these moraya features:**

- `<textarea>` with `bind:value`, ghost div auto-sizing (CSS grid technique)
- Tab key → insert spaces
- Line numbers (optional)
- Debounced dirty marking (50ms) — calls `on_dirty_change(true)` + `on_markdown_change(content)`
- `onMount`: restore cursor from `editor_store.cursor_offset`, scroll from `editor_store.scroll_fraction`
- `onDestroy`: save cursor offset + scroll fraction to store, flush pending debounced content
- Debounced outline extraction (300ms) using `extract_headings_from_markdown()`

**Adapt to otterly conventions:**

- CSS custom properties: `--space-*`, `--text-*`, `--border`, `--foreground`, `--muted-foreground`
- BEM class naming: `SourceEditor__textarea`, `SourceEditor__line-numbers`, etc.
- Snake case file name

**Search integration:** Expose `searchText`, `searchFindNext`, `searchFindPrev`, `searchReplaceCurrent`, `searchReplaceAll`, `clearSearch` methods via `bind:this` (same API as moraya).

### 5. Register action IDs

**Modify:** `src/lib/app/action_registry/action_ids.ts`

```ts
editor_toggle_mode: "editor.toggle_mode",
```

### 6. Register mode toggle action

**Modify:** `src/lib/app/orchestration/app_actions.ts`

Register `editor.toggle_mode`:

1. If current mode is `"visual"` and editor service has a session → call `editor_service.flush()` to sync Milkdown → store
2. Save cursor/scroll position from Milkdown session to store (cursor offset as fraction of doc length × markdown length, scroll fraction from DOM)
3. Call `editor_store.toggle_editor_mode()`

The Svelte conditional rendering handles the rest (destroys one editor, mounts the other).

### 7. Add hotkey binding

**Modify:** `src/lib/features/hotkey/domain/default_hotkeys.ts`

```ts
{ action_id: ACTION_IDS.editor_toggle_mode, key: "CmdOrCtrl+/", ... }
```

`CmdOrCtrl+/` is unused and matches moraya's convention.

### 8. Update `note_editor.svelte` for conditional rendering

**Modify:** `src/lib/features/note/ui/note_editor.svelte`

```svelte
{#if open_note}
  {#if editor_mode === "visual"}
    <div use:mount_editor={open_note} class="NoteEditor__content"></div>
  {:else}
    <SourceEditor
      initial_markdown={open_note.markdown}
      on_markdown_change={(md) =>
        stores.editor.set_markdown(open_note.meta.id, as_markdown_text(md))}
      on_dirty_change={(dirty) =>
        stores.editor.set_dirty(open_note.meta.id, dirty)}
      on_cursor_change={(cursor) =>
        stores.editor.set_cursor(open_note.meta.id, cursor)}
      on_outline_change={(headings) => stores.outline?.set_headings(headings)}
    />
  {/if}
{:else}
  <!-- empty state unchanged -->
{/if}
```

When mode switches visual→source: `use:mount_editor`'s `destroy` fires (`app_editor_unmount`), then SourceEditor mounts.
When mode switches source→visual: SourceEditor's `onDestroy` flushes content, then Milkdown mounts with content from store.

### 9. Make `EditorService.flush()` mode-aware

**Modify:** `src/lib/features/editor/application/editor_service.ts`

```ts
flush(): EditorFlushResult | null {
  if (!this.active_note) return null;

  // In visual mode, sync Milkdown → store first
  if (this.session && this.editor_store.editor_mode === "visual") {
    const markdown = this.session.get_markdown();
    this.editor_store.set_markdown(this.active_note.meta.id, as_markdown_text(markdown));
  }

  // Read from store (current in both modes)
  const open_note = this.editor_store.open_note;
  if (!open_note) return null;
  return { note_id: open_note.meta.id, markdown: open_note.markdown };
}
```

### 10. Add mode indicator to status bar

**Modify:** `src/lib/features/editor/ui/editor_status_bar.svelte`

Add prop `editor_mode: EditorMode` and `on_mode_toggle: () => void`.

Render a clickable indicator: `Visual` / `Source`.

**Modify:** `src/lib/app/bootstrap/ui/workspace_layout.svelte`

Wire new props:

```svelte
editor_mode={stores.editor.editor_mode}
on_mode_toggle={() =>
  void action_registry.execute(ACTION_IDS.editor_toggle_mode)}
```

### 11. Update barrel export

**Modify:** `src/lib/features/editor/index.ts`

Add:

```ts
export type { EditorMode } from "$lib/features/editor/domain/editor_mode";
export { extract_headings_from_markdown } from "$lib/features/editor/domain/extract_headings";
```

### 12. Tests

**New:** `tests/unit/editor/editor_store_mode.test.ts`

- `toggle_editor_mode()` toggles visual ↔ source
- `set_editor_mode()` no-ops on same mode
- `set_cursor_offset` / `set_scroll_fraction` store and retrieve
- `reset()` clears mode state

**New:** `tests/unit/editor/extract_headings.test.ts`

- Empty string → empty array
- Single heading, multiple levels (h1–h6)
- Trailing `###` stripped
- Non-heading lines skipped

**Modify:** existing editor service tests

- `flush()` returns store content when session is null (source mode path)

---

## Files Summary

| Action | File                                                    |
| ------ | ------------------------------------------------------- |
| Create | `src/lib/features/editor/domain/editor_mode.ts`         |
| Create | `src/lib/features/editor/domain/extract_headings.ts`    |
| Create | `src/lib/features/editor/ui/source_editor.svelte`       |
| Create | `tests/unit/editor/editor_store_mode.test.ts`           |
| Create | `tests/unit/editor/extract_headings.test.ts`            |
| Modify | `src/lib/features/editor/state/editor_store.svelte.ts`  |
| Modify | `src/lib/features/editor/application/editor_service.ts` |
| Modify | `src/lib/features/editor/index.ts`                      |
| Modify | `src/lib/features/editor/ui/editor_status_bar.svelte`   |
| Modify | `src/lib/features/note/ui/note_editor.svelte`           |
| Modify | `src/lib/app/action_registry/action_ids.ts`             |
| Modify | `src/lib/app/orchestration/app_actions.ts`              |
| Modify | `src/lib/features/hotkey/domain/default_hotkeys.ts`     |
| Modify | `src/lib/app/bootstrap/ui/workspace_layout.svelte`      |

**Key reusable code:**

- Moraya `SourceEditor.svelte`: `/Users/abir/src/moraya/src/lib/editor/SourceEditor.svelte`
- Moraya editor store mode pattern: `/Users/abir/src/moraya/src/lib/stores/editor-store.ts`
- Existing `OutlineHeading` type from `$lib/features/outline`
- Existing `CursorInfo` type from `$lib/shared/types/editor`
- Existing `as_markdown_text` from editor service imports

## Verification

1. `pnpm check` — type checking passes
2. `pnpm lint` — no lint errors
3. `pnpm test` — all tests pass (existing + new)
4. `pnpm format` — formatting clean
5. Manual: open a note → `Cmd+/` toggles between visual and source → content preserved both ways
6. Manual: edit in source mode → dirty indicator appears → autosave triggers
7. Manual: cursor/scroll position approximately restored on mode switch
8. Manual: outline panel updates in source mode
9. Manual: status bar shows correct line/col/word count in source mode
10. Manual: click mode indicator in status bar toggles mode
