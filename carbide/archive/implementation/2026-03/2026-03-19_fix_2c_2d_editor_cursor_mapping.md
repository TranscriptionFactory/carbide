---
title: "Fix 2C + 2D: Editor Cursor Mapping & Inline Formatting"
date_created: 2026-03-19
bugs: ["2C", "2D"]
status: "implemented"
---

## Problem

### 2D: Cursor position not mapped correctly when toggling source/visual mode

**Visual -> Source:** The cursor offset was computed using a naive line/column mapping that assumed ProseMirror's internal text representation (single `\n` between blocks) matches markdown's line structure (double `\n` between blocks, plus heading prefixes `## `, list markers `- `, blockquote `> `, etc.). This caused the cursor to jump to the wrong position.

**Source -> Visual:** The cursor position was completely lost. The `onDestroy` callback in SourceEditor fired _after_ the mode toggle, so the saved offset was stale. No code restored the ProseMirror cursor from the source editor's position.

### 2C: Inline formatting not live-updating in visual mode

Investigation found no plugin-level cause. All `handleTextInput` handlers pass through correctly for `*`, `` ` ``, `~` typed without selection. No `filterTransaction` or mark-suppression exists. The `inputRules` plugin correctly dispatches transactions with `addMark()`. CSS rules for `.ProseMirror strong`, `.ProseMirror em`, `.ProseMirror code` are all correct.

The primary scenario where formatting appeared "not live-updating" was during mode transitions: edits made in source mode weren't reflected with correct cursor positioning when returning to visual mode, creating the impression that formatting hadn't been applied.

## Root Cause

**2D:** Two separate mapping bugs:

1. `app_actions.ts` (visual->source): Counted lines in markdown using ProseMirror's line number, which doesn't account for blank lines between blocks, heading prefixes, list markers, or blockquote markers.
2. `app_actions.ts` (source->visual): Called `sync_visual_from_markdown()` but never restored the ProseMirror cursor position from the source editor's offset.

**2C:** Primarily a symptom of 2D's broken sync path. No independent rendering bug found.

## Solution

### New: `cursor_offset_mapper.ts` (domain layer)

Created a bidirectional position mapper between ProseMirror doc positions and markdown character offsets.

**`prose_cursor_to_md_offset(doc, cursor_pos, markdown)`:**

- Gets ProseMirror text content before cursor via `doc.textBetween(0, pos, "\n")`
- Walks through the markdown in parallel, matching text characters while skipping:
  - Frontmatter delimiters (`---`)
  - Code fence delimiters (` ``` `)
  - Heading prefixes (`# `, `## `, etc.)
  - Blockquote markers (`> `)
  - List markers (`- `, `1. `, `[ ] `, etc.)
  - Blank lines between blocks
  - Inline mark delimiters (handled via character mismatch fallthrough)
- Returns the markdown character offset when all text characters are consumed.

**`md_offset_to_prose_pos(doc, md_offset, markdown)`:**

- Uses binary search on the ProseMirror position space
- For each candidate position, calls the forward mapper
- Finds the ProseMirror position whose forward-mapped markdown offset matches the target

### Modified: `prosemirror_adapter.ts`

Added two methods to the editor session handle:

- `get_cursor_markdown_offset()`: Returns the current ProseMirror cursor position as a markdown character offset
- `set_cursor_from_markdown_offset(offset)`: Sets the ProseMirror cursor to the position corresponding to a markdown offset

### Modified: `editor_service.ts`

Exposed `get_cursor_markdown_offset()` and `set_cursor_from_markdown_offset(offset)` as service methods that delegate to the session.

### Modified: `app_actions.ts` (editor_toggle_mode action)

**Visual -> Source:** Replaced the broken line-counting code with `services.editor.get_cursor_markdown_offset()`.

**Source -> Visual:** Before toggling, reads the current source cursor position from `editor_store.cursor` (CodeMirror line/col, which maps directly to markdown). Computes the markdown character offset. After `sync_visual_from_markdown()`, calls `services.editor.set_cursor_from_markdown_offset()` to restore cursor.

### Modified: `note_editor.svelte`

Simplified `source_cursor_offset` from a complex `$derived.by()` with manual line counting to a simple `$derived(stores.editor.cursor_offset)`, since the offset is now correctly computed by the action handler.

### Modified: `ports.ts`

Added `get_cursor_markdown_offset` and `set_cursor_from_markdown_offset` to the `EditorSession` interface.

## Files Changed

| File                                                       | Change                                  |
| ---------------------------------------------------------- | --------------------------------------- |
| `src/lib/features/editor/adapters/cursor_offset_mapper.ts` | **New** — bidirectional position mapper |
| `src/lib/features/editor/adapters/prosemirror_adapter.ts`  | Added cursor mapping methods to session |
| `src/lib/features/editor/application/editor_service.ts`    | Exposed cursor mapping methods          |
| `src/lib/features/editor/ports.ts`                         | Added optional session methods          |
| `src/lib/app/orchestration/app_actions.ts`                 | Fixed mode toggle cursor mapping        |
| `src/lib/features/note/ui/note_editor.svelte`              | Simplified cursor offset derivation     |
| `tests/unit/domain/cursor_offset_mapper.test.ts`           | **New** — 16 tests                      |

## Test Coverage

16 unit tests in `cursor_offset_mapper.test.ts`:

- Forward mapping: paragraphs, multi-paragraph, headings (h1/h2), frontmatter, lists, blockquotes, code blocks, empty doc, end-of-doc
- Inverse mapping: start, end, round-trip for paragraphs/headings/multi-paragraph

## Limitations

- Inline mark delimiters (`**`, `*`, `` ` ``, `~~`) are handled via character-mismatch fallthrough rather than explicit parsing. This means the intra-block offset may be off by a few characters for heavily formatted lines.
- The binary search in `md_offset_to_prose_pos` may land on non-cursor-valid ProseMirror positions (e.g., inside a node boundary), which is handled by the `TextSelection.create` try/catch in the adapter.
