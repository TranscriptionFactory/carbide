# LSP Fix Progress

## Branch: `feat/block-ops`
## Commit: `93e41cf0` — Fix LSP position mapping and enhance tooltips (Phases 1-4, 6-7)

---

## Completed Phases

### Phase 1: Fix Position Mapping (Critical)
- **1a**: Added `get_markdown: () => string` to `PluginContext` type and wired it in `prosemirror_adapter.ts`
- **1b**: Rewrote `lsp_plugin_utils.ts` — `line_and_character_from_pos` and `lsp_pos_to_prose_pos` now route through `cursor_offset_mapper.ts` (using `prose_cursor_to_md_offset` / `md_offset_to_prose_pos`). Old `offset_for_line_character` replaced with `md_offset_from_line_character` operating on markdown string, not ProseMirror flat text.
- **1c-d**: Updated all 6 LSP plugin files + `lsp_extension.ts` to accept and pass `get_markdown`. All position computations now use the markdown string.

### Phase 2: Render Markdown in Hover Tooltips
- Created `lsp_tooltip_renderer.ts` using `markdown-it` (already in deps)
- Updated `lsp_hover_plugin.ts` `show()` to render markdown via `innerHTML`
- Updated `diagnostics_decoration_plugin.ts` `show_tooltip()` similarly
- Added CSS for `.lsp-hover-content` in `editor.css`

### Phase 3: Hover Race Condition Fix
- Added `hover_gen` counter in `lsp_hover_plugin.ts`
- Increment on each `trigger_at_pos`, check `gen !== hover_gen` before showing result
- Also increments on `mouseleave` to cancel pending hovers

### Phase 4: Tooltip Overlap Resolution
- LSP hover tooltip z-index set to `9998`, diagnostic tooltip stays at `9999`
- `has_diagnostic_at_pos()` checks if `.diagnostic-tooltip` is visible before showing LSP hover
- If diagnostic tooltip visible, hover result still sent to bottom panel but floating tooltip skipped

### Phase 6: Code Action `dispatch` in `update` Fix
- Removed the `view.dispatch()` call from `update()` in `lsp_code_action_plugin.ts`
- The `state.apply` already clears decorations on `tr.selectionSet`, so the explicit dispatch was redundant and caused issues
- `update()` now only handles UI cleanup (`hide_dropdown()`, clear `current_lsp_actions`)

### Phase 7: Go-to-Definition Visual Feedback
- Added `keydown`/`keyup`/`blur` handlers in `lsp_definition_plugin.ts` to toggle `lsp-definition-active` class
- Added CSS: `.lsp-definition-active .wiki-link, .lsp-definition-active a[href]` get `cursor: pointer` and `underline`
- Added `on_no_definition` optional callback

---

## Remaining Phases

### Phase 5: Completion `textEdit` Support (Rust + TS)
**Status**: Not started. Depends on Phase 1 (done).

**What to do:**

1. **`src/lib/features/markdown_lsp/types.ts`**: Extend `MarkdownLspCompletionItem`:
```ts
export type MarkdownLspCompletionItem = {
  label: string;
  detail: string | null;
  insert_text: string | null;
  text_edit: {
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    new_text: string;
  } | null;
  additional_text_edits: Array<{
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    new_text: string;
  }> | null;
};
```

2. **`src-tauri/src/features/markdown_lsp/types.rs`**: Add matching Rust struct fields with `Option<>`

3. **`src-tauri/src/features/markdown_lsp/service.rs`**: In `normalize_completion_item()`, parse `textEdit` and `additionalTextEdits` from the raw JSON value

4. **`src/lib/features/editor/adapters/lsp_completion_plugin.ts`**: In `accept()`:
   - If `item.text_edit` exists, convert LSP range → PM positions using `lsp_pos_to_prose_pos`
   - Replace the range with `new_text`
   - Apply `additional_text_edits` in reverse document order
   - Fallback to current behavior if no `text_edit`

### Phase 9: Tests for Position Mapping
**Status**: Not started. Depends on Phase 1 (done).

**What to do:**

Create `tests/unit/editor/lsp_position_mapping.test.ts` testing:
1. Simple paragraph — offset maps correctly
2. Heading (`# Hello`) — `# ` prefix accounts for offset
3. Multi-paragraph — line numbers correct
4. Blockquote (`> text`) — `> ` prefix handled
5. List items (`- item`, `1. item`) — marker handled
6. Frontmatter — body maps to correct lines after `---`
7. Code fence — no prefix stripping inside fences
8. Round-trip: PM pos → line/char → PM pos returns original

Use `parse_markdown` + `serialize_markdown` to create real ProseMirror docs. Import `line_and_character_from_pos` and `lsp_pos_to_prose_pos` from `lsp_plugin_utils.ts`. Need to mock `EditorView` or use `EditorState` directly (the functions take `view` but only use `view.state.doc`).

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/features/editor/extensions/types.ts` | Added `get_markdown` to `PluginContext` |
| `src/lib/features/editor/adapters/prosemirror_adapter.ts` | Wire `get_markdown: () => current_markdown` |
| `src/lib/features/editor/adapters/lsp_plugin_utils.ts` | Full rewrite — uses `cursor_offset_mapper.ts` |
| `src/lib/features/editor/adapters/lsp_tooltip_renderer.ts` | **New** — markdown-it renderer |
| `src/lib/features/editor/adapters/lsp_hover_plugin.ts` | `get_markdown` input, md render, race fix, overlap check |
| `src/lib/features/editor/adapters/lsp_completion_plugin.ts` | `get_markdown` input, passes markdown to position fn |
| `src/lib/features/editor/adapters/lsp_definition_plugin.ts` | `get_markdown` input, visual feedback, `on_no_definition` |
| `src/lib/features/editor/adapters/lsp_code_action_plugin.ts` | `get_markdown` input, removed dispatch from update() |
| `src/lib/features/editor/adapters/lsp_inlay_hints_plugin.ts` | `get_markdown` input, uses `lsp_pos_to_prose_pos` |
| `src/lib/features/editor/adapters/diagnostics_decoration_plugin.ts` | `get_markdown` param, uses `lsp_pos_to_prose_pos`, md render |
| `src/lib/features/editor/extensions/lsp_extension.ts` | Passes `get_markdown` to all plugin factories |
| `src/lib/features/editor/extensions/index.ts` | Passes `ctx.get_markdown` to diagnostics plugin |
| `src/styles/editor.css` | `.lsp-hover-content` styles, `.lsp-definition-active` styles |

## Verification
- `pnpm check` — 0 errors
- `pnpm test` — 314 files, 3367 tests passed
- `pnpm lint` — only pre-existing cross-feature import violations (unrelated)
