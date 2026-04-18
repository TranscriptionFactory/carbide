# Visual Editor Regression Fix

## Summary

After ejecting Milkdown in favor of pure ProseMirror, several editor features broke because Milkdown-specific infrastructure was removed without replacing the behaviors it provided.

## Issues Found & Fixed

### 1. Lists have no visible bullets or numbers (FIXED)

**Root cause:** CSS set `list-style: none` on `<ul>`/`<ol>` elements. Under Milkdown, custom bullet rendering was handled by `.milkdown-list-item-block` nodeViews that created flex-layout wrappers with `.label.bullet::before` pseudo-elements. After ejection, these nodeViews no longer exist — the schema's `toDOM` emits bare `<li>` elements. With `list-style: none` still active and no replacement rendering, lists appeared as plain indented text with no markers.

**Fix:** Replaced dead Milkdown CSS with standard CSS list rendering:

- `list-style-type: disc` for `<ul>`, `circle` for nested, `square` for triple-nested
- `list-style-type: decimal` for `<ol>`
- `::marker` styling for color and font consistency
- `padding-left: 1.625rem` for proper indentation
- Task items (`li[data-item-type="task"]`) retain `list-style: none` with their own checkbox pseudo-elements

**Files:** `src/styles/editor.css`

### 2. No list keymaps — Enter/Tab/Shift-Tab broken in lists (FIXED)

**Root cause:** `prosemirror-schema-list` was installed as a dependency but never imported. Without `splitListItem`, `liftListItem`, and `sinkListItem`:

- Enter inside a list item split the paragraph (creating two paragraphs in one `<li>`) instead of creating a new list item
- Tab did nothing (no nesting)
- Shift-Tab did nothing (no un-nesting)
- Enter on an empty list item didn't exit the list

**Fix:** Added list keymap before `baseKeymap` in the plugin chain:

- `Enter` → `chainCommands(splitListItem, liftListItem)` — splits non-empty items, lifts empty items out of list
- `Tab` → `sinkListItem` — increases nesting level
- `Shift-Tab` → `liftListItem` — decreases nesting level

**Files:** `src/lib/features/editor/adapters/prosemirror_adapter.ts`

### 3. Task list backspace-to-remove-checkbox broken (FIXED)

**Root cause:** The `task_keymap_plugin.ts` checked `$pos.parent` for `list_item` type, but in the ProseMirror document tree `list_item > paragraph > text`, `$pos.parent` at text level is the `paragraph`, not the `list_item`. The check always returned false.

**Fix:** Navigate up to the correct depth:

- Use `$pos.node($pos.depth - 1)` to reach the `list_item` ancestor
- Verify cursor is in the first child paragraph via `$pos.index(li_depth) !== 0`
- Use `$pos.before(li_depth)` for the correct node position in `setNodeMarkup`

**Files:** `src/lib/features/editor/adapters/task_keymap_plugin.ts`

### 4. Dead Milkdown CSS removed (FIXED)

Removed ~80 lines of `.milkdown-list-item-block` CSS that targeted elements no longer present in the DOM after the Milkdown ejection.

**Files:** `src/styles/editor.css`

### 5. Task list CSS selectors scoped (FIXED)

Scoped `li[data-item-type="task"]` selectors under `.ProseMirror` to prevent accidental style bleeding.

**Files:** `src/styles/editor.css`

## Undo Queue Investigation

**Conclusion:** Undo works correctly at the code level.

The `history()` plugin is registered in the plugin array. The `undo`/`redo` commands from `prosemirror-history` correctly look up history state via `historyKey.getState(state)`, which works regardless of plugin ordering. Runtime test confirmed undo operates correctly with this plugin configuration.

No global keyboard handlers (`use_keyboard_shortcuts.svelte.ts`) intercept `Cmd-Z`. The wiki link plugin's `addToHistory: false` on full-scan transactions is correct — decorative re-annotations should not pollute the undo stack.

The `set_markdown()` method on the ProseMirror adapter replaces the entire document as a single transaction (which is added to history). It is only called from:

- `open_buffer()` (note switching — creates fresh EditorState, clean history)
- `apply_selection_transform()` (AI/selection features — intentional full replacement)

Normal editing transactions flow through ProseMirror's standard dispatch and are properly recorded.

**If undo does not work at runtime**, investigate:

1. Tauri webview keyboard event capture
2. OS-level shortcut conflicts
3. Whether a reactor or effect is calling `session.set_markdown()` during normal editing (would collapse history into single-entry replacement)

## Heading Rendering

Headings (h1-h6) render correctly. The schema's `toDOM` emits standard `<h1>`-`<h6>` elements, CSS variables `--editor-heading-1` through `--editor-heading-6` are defined in `design_tokens.css`, and `.ProseMirror h1`-`.ProseMirror h6` styles are applied.

## Validation

- `pnpm check` — 0 errors
- `pnpm lint` — pre-existing errors (excalidraw, unrelated)
- `pnpm test` — pre-existing failure (hr gradient test, unrelated)
- `pnpm format` — applied
