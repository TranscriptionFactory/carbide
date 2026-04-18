# Sprint: P1 — Editor Core Polish

**Date:** 2026-03-18
**Items:** #3 (Code editing fundamentals — partial), #4 (Strikethrough), #6 (@-mention date picker)

---

## #3 Code Editing Fundamentals (partial)

### Tab Indent/Dedent in Code Blocks

**Problem:** Pressing Tab inside a code block with selected lines replaces the selection instead of indenting. No Shift-Tab dedent support.

**Root cause:** The code block keydown handler in `code_block_view_plugin.ts` only handled Ctrl+Enter and arrow keys — no Tab handling.

**Fix:** Added Tab and Shift-Tab handlers to `code_block_view_plugin.ts`:

- **Tab (no selection or single line):** Inserts 2 spaces at cursor
- **Tab (multi-line selection):** Prepends 2 spaces to each selected line, preserves selection
- **Shift-Tab (single line):** Removes up to 2 leading spaces from current line
- **Shift-Tab (multi-line selection):** Removes up to 2 leading spaces from each selected line, adjusts selection

**Implementation:** Lines 474-585 in `code_block_view_plugin.ts`. Uses text manipulation on the code block's content with proper selection adjustment after indent/dedent.

### Remaining #3 sub-items (not started):

- Code folding for fenced code blocks
- Language autocomplete when typing ` ``` ` + language name
- Wrap selection in code fence when typing ` ``` ` with text selected
- Wrap selection in wikilinks/parens (general wrappable operations)

---

## #4 Strikethrough Support

**Problem:** Schema and markdown pipeline support `~~text~~` strikethrough, but no input rule exists for inline typing and no keyboard shortcut.

**Fix:**

1. Created `strikethrough_plugin.ts` — input rule matching `~~text~~` that auto-applies the strikethrough mark
2. Added `Mod-Shift-X` keymap to toggle strikethrough on selection in `prosemirror_adapter.ts`
3. Plugin registered after block input rules

**Files:**

- NEW: `src/lib/features/editor/adapters/strikethrough_plugin.ts`
- EDIT: `src/lib/features/editor/adapters/prosemirror_adapter.ts` (import, keymap, plugin registration)

---

## #6 @-Mention Date Picker Fix

**Problem:** The `@` trigger for date references shows no popup — completely non-functional.

**Root cause:** CSS/JS visibility conflict. `create_menu_el()` sets `data-show="false"` on creation. CSS rule `.DateSuggestMenu[data-show="false"] { display: none }` keeps it hidden. `show_menu()` clears inline `style.display` but the attribute-based CSS rule still applies. `data-show` was never set to `"true"`.

Secondary issue: z-index was 100 while wiki-suggest and slash-command use 9999.

**Fix in `date_suggest_plugin.ts`:**

- `show_menu()`: Set `menu.dataset.show = "true"` before clearing display. Changed z-index to 9999.
- `hide_menu()`: Set `menu.dataset.show = "false"` alongside display none.

---

## Validation

- `pnpm check`: 0 errors, 3 warnings (all pre-existing a11y)
- `pnpm lint`: 476 errors (all pre-existing in excalidraw)
- `pnpm test`: 2 failures (both pre-existing)
- `pnpm format`: Applied

## Status: IMPLEMENTED
