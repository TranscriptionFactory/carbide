# Mdit Port Addendum: Missing High-Value Items

**Date:** 2026-04-17
**Depends on:** `2026-04-17_mdit_port_plan.md` (Phases 1-5)
**Reference:** `carbide/research/mdit_comparison.md`, mdit source at `/Users/abir/src/KBM_Notes/mdit/`

---

## Overview

Items discovered during mdit port review that are missing from the original plan. Ordered by implementation priority — some items are prerequisites for Phase 3 (Inline AI), others are table-stakes block editor features.

---

## Phase 2.5: Block Operations (1.5-2 days)

**Rationale:** "Turn Into" and "Duplicate" are table-stakes for any block editor. They also establish patterns (block-level commands, context menu integration) that Phase 3's inline AI will reuse. Ship before Phase 3.

### 2.5.1 Turn Into — Block Type Conversion

Transform the current block into a different block type. Operates on the block under cursor (or each block in a multi-block selection, Phase 2.7).

**Supported conversions:**

| From → To | Method |
|---|---|
| paragraph → heading (1-3) | `setBlockType()` |
| heading → paragraph | `setBlockType()` |
| heading → heading (different level) | `setBlockType()` with new level |
| paragraph → blockquote | `wrapIn()` |
| blockquote → paragraph | `lift()` |
| paragraph → bullet_list | `wrapInList()` |
| paragraph → ordered_list | `wrapInList()` |
| paragraph → todo list | `wrapInList()` + set `checked: false` |
| list_item → different list type | lift from current list, wrap in new |
| paragraph → code_block | `setBlockType()` |
| code_block → paragraph | `setBlockType()` |
| paragraph → callout (note) | `replaceWith()` callout structure |
| any simple block → any simple block | Chain of lift + setBlockType/wrapIn |

**Implementation:**

1. **Domain function** — `src/lib/features/editor/domain/block_transforms.ts`
   ```
   turn_into(state, dispatch, target_type, attrs?) → boolean
   ```
   - Resolve current block at selection (top-level ancestor of cursor)
   - If block type matches target, no-op (return false)
   - Build transaction: lift out of wrappers if needed → convert → re-wrap if target is wrapper
   - Handle edge cases: code_block loses marks, heading gains level attr, list items need list wrapper

2. **Action registration** — Add `ACTION_IDS.editor.turn_into_*` entries:
   - `turn_into_paragraph`, `turn_into_heading_1/2/3`, `turn_into_blockquote`
   - `turn_into_bullet_list`, `turn_into_ordered_list`, `turn_into_todo_list`
   - `turn_into_code_block`, `turn_into_callout_note`

3. **Context menu integration** — `editor_context_menu.svelte`:
   - Add "Turn Into" submenu (always visible, not gated on IWE)
   - Items: Paragraph, Heading 1-3, Blockquote, Bullet List, Ordered List, Todo List, Code Block
   - Each calls `action_registry.execute(turn_into_*)`
   - Grey out current type

4. **Keyboard shortcut** — `Cmd+Shift+<number>` for headings (matches Notion/Obsidian):
   - `Cmd+Shift+0` → paragraph
   - `Cmd+Shift+1` → heading 1
   - `Cmd+Shift+2` → heading 2
   - `Cmd+Shift+3` → heading 3

**Files touched:**
- NEW: `src/lib/features/editor/domain/block_transforms.ts`
- EDIT: `src/lib/features/editor/ui/editor_context_menu.svelte`
- EDIT: `src/lib/app/action_registry/action_ids.ts`
- EDIT: `src/lib/app/action_registry/register_actions.ts`
- EDIT: `src/lib/features/editor/extensions/core_extension.ts` (keymaps)
- NEW: `tests/unit/domain/block_transforms.test.ts`

**Tests (BDD scenarios):**
- Paragraph → heading 1/2/3 preserves inline content and marks
- Heading → paragraph preserves inline content
- Paragraph → blockquote wraps correctly
- Blockquote → paragraph lifts correctly
- Paragraph → bullet list creates list structure
- List item → different list type converts
- Code block → paragraph strips code-only attrs
- Paragraph → callout creates callout with title + body
- No-op when target type matches current type
- Cursor position preserved after conversion
- Works at any nesting depth (blockquote > paragraph → heading)

### 2.5.2 Duplicate Block

Copy current block (or section for headings) and insert below.

**Implementation:**

1. **Domain function** — `src/lib/features/editor/domain/block_transforms.ts`
   ```
   duplicate_block(state, dispatch) → boolean
   ```
   - Resolve current top-level block at cursor
   - For headings: use `compute_heading_ranges()` to get section (heading + body), duplicate entire section
   - For other blocks: deep-copy the single node via `node.copy(node.content)`
   - Insert copy after original (or after section end for headings)
   - Move cursor to start of duplicated block

2. **Action** — `ACTION_IDS.editor.duplicate_block`
   - Shortcut: `Cmd+Shift+D` (matches mdit, VS Code)

3. **Context menu** — Add "Duplicate" item with `Cmd+Shift+D` shortcut hint

**Files touched:**
- EDIT: `src/lib/features/editor/domain/block_transforms.ts` (same file as Turn Into)
- EDIT: `src/lib/features/editor/ui/editor_context_menu.svelte`
- EDIT: `src/lib/app/action_registry/action_ids.ts`
- EDIT: `src/lib/app/action_registry/register_actions.ts`
- EDIT: `tests/unit/domain/block_transforms.test.ts`

**Tests:**
- Duplicate paragraph creates identical sibling
- Duplicate heading duplicates entire section (heading + children until next same-level heading)
- Duplicate code block preserves language attr
- Duplicate callout preserves type, foldable state, title, body
- Duplicate list item duplicates single item (not entire list)
- Cursor moves to duplicated block
- Undo reverts in single step

### 2.5.3 Delete Block

Explicit block deletion (not just Backspace, which merges).

**Implementation:**

1. **Domain function** — `block_transforms.ts`
   ```
   delete_block(state, dispatch) → boolean
   ```
   - Resolve current top-level block
   - Delete node, move cursor to previous block end (or next block start if first)
   - For headings: only delete heading node, promote children to parent level (don't delete section)

2. **Action** — `ACTION_IDS.editor.delete_block`
3. **Context menu** — Add "Delete" item

**Files:** Same as 2.5.2.

---

## Phase 2.6: Content-Visibility Chunking (0.5 days)

**Rationale:** Near-zero effort, significant rendering perf for docs with 50+ blocks. Independent of everything. Can ship immediately.

### Implementation

CSS-only approach with a thin ProseMirror plugin for chunk wrapping.

**Option A — Pure CSS (preferred, simpler):**
Apply `content-visibility: auto` directly to top-level block nodes.

```css
.ProseMirror > *:not(.ProseMirror-selectednode) {
  content-visibility: auto;
  contain-intrinsic-block-size: auto 3rem;
}
```

`contain-intrinsic-block-size: auto 3rem` gives the browser a size estimate for off-screen blocks. The `auto` keyword means the browser remembers the actual rendered size after first paint and uses that for subsequent layout passes.

**Caveats:**
- Find-in-page (browser Ctrl+F) may not search hidden blocks. ProseMirror's own find plugin works at the model level, unaffected.
- Selection rendering across hidden blocks works fine (ProseMirror handles it).
- Must NOT apply to the currently selected node (breaks cursor rendering).

**Option B — Chunk wrapper plugin (if Option A has issues):**
Plugin wraps every N blocks (e.g. 80) in a `<div class="editor-chunk">` with `content-visibility: auto`. More control, more complexity. Only pursue if Option A causes problems.

**Files touched:**
- EDIT: `src/styles/editor.css` (3 lines)
- CONDITIONAL NEW: `src/lib/features/editor/adapters/content_visibility_plugin.ts` (only if Option B)

**Tests:**
- Visual regression: render a 200-block doc, verify no layout shift
- Performance benchmark: measure layout time before/after on 500-block doc

---

## Phase 2.7: Multi-Block Selection (2-3 days)

**Rationale:** Underpins batch Turn-Into, batch Delete, and AI context from selection. Medium priority — useful but not blocking for Phase 3 (which can use text selection). Can be deferred to after Phase 3 if needed.

### 2.7.1 Selection Model

ProseMirror has `NodeSelection` for single nodes and `TextSelection` for ranges. Multi-block selection needs a custom `Selection` subclass or a decoration-based approach.

**Approach: Decoration-based (simpler, no custom Selection):**
- Track selected block positions in plugin state (Set<number>)
- Render selection highlight via `DecorationSet` (blue border/background per block)
- Keyboard: Shift+ArrowDown/Up extends selection to next/prev block
- Mouse: Shift+click on block handle adds/removes from selection
- Escape clears multi-selection

**Plugin state:**
```typescript
type BlockSelectionState = {
  selected_positions: Set<number>;  // top-level block positions
  anchor_pos: number | null;        // first block in selection range
};
```

### 2.7.2 Batch Operations

When multi-selection is active, context menu operations apply to all selected blocks:
- **Turn Into**: Convert each selected block
- **Delete**: Remove all selected blocks
- **Duplicate**: Duplicate all selected blocks (in order)
- **AI**: Send all selected blocks as context

### 2.7.3 Implementation

1. **Plugin** — `src/lib/features/editor/adapters/block_selection_plugin.ts`
   - Plugin state: tracked positions + decoration set
   - Shift+click on drag handle: toggle block in selection
   - Shift+Arrow: extend selection
   - Escape: clear selection
   - Decorations: `.block-selected` class per block

2. **CSS** — `editor.css`
   ```css
   .block-selected {
     background: color-mix(in oklch, var(--primary) 8%, transparent);
     outline: 1px solid color-mix(in oklch, var(--primary) 25%, transparent);
     border-radius: 2px;
   }
   ```

3. **Integration** — Modify `block_transforms.ts` functions to accept optional position array
   - `turn_into(state, dispatch, target, attrs, positions?)`
   - `delete_block(state, dispatch, positions?)`
   - `duplicate_block(state, dispatch, positions?)`

4. **Context menu** — When multi-selection active, show count badge ("3 blocks selected")

**Files:**
- NEW: `src/lib/features/editor/adapters/block_selection_plugin.ts`
- EDIT: `src/lib/features/editor/extensions/index.ts` (wire plugin)
- EDIT: `src/lib/features/editor/domain/block_transforms.ts` (batch support)
- EDIT: `src/lib/features/editor/ui/editor_context_menu.svelte`
- EDIT: `src/styles/editor.css`
- NEW: `tests/unit/adapters/block_selection.test.ts`

---

## Phase 3.1 Addendum: AI in Selection Toolbar

The original Phase 3.1 describes the AI menu as a standalone floating popover. It should also integrate with the existing formatting toolbar.

**Additional requirement:** Add "Ask AI" as the first button group in the formatting toolbar (matching mdit's pattern). When clicked with text selected:
- Opens the AI menu popover anchored to selection
- Same behavior as Cmd+J shortcut

**Files:**
- EDIT: `src/lib/features/editor/ui/formatting_toolbar.svelte` — add AI button group
- EDIT: `src/lib/features/editor/adapters/formatting_toolbar_commands.ts` — add `ask_ai` command

---

## Phase 7: Create Linked Notes from List Items (1 day)

Select list items → right-click → "Create Linked Notes" → each item becomes a `[[wiki link]]` and a new note file is created.

### Implementation

1. **Domain** — `src/lib/features/editor/domain/linked_note_creation.ts`
   - Takes array of list item text strings
   - For each: create note file via vault service, return wiki target path
   - Return results array with `{ wiki_target, link_text }` per item

2. **Editor transform** — `block_transforms.ts`
   - `convert_list_items_to_links(state, dispatch, items_with_targets)`
   - For each list item: replace text content with wiki link inline node

3. **Context menu** — Add "Create Linked Notes" item
   - Only visible when selection is within list items
   - Calls action → service creates files → editor transform converts items

**Files:**
- NEW: `src/lib/features/editor/domain/linked_note_creation.ts`
- EDIT: `src/lib/features/editor/domain/block_transforms.ts`
- EDIT: `src/lib/features/editor/ui/editor_context_menu.svelte`
- EDIT: `src/lib/app/action_registry/action_ids.ts`

---

## Updated Phase Summary

| Phase | Items | Effort | Value | Dependencies |
|---|---|---|---|---|
| **2.5: Block Ops** | Turn Into, Duplicate, Delete | 1.5-2 days | **High** (table stakes) | None |
| **2.6: Chunking** | content-visibility CSS | 0.5 days | Medium (perf) | None |
| **2.7: Multi-Select** | Block selection + batch ops | 2-3 days | Medium-High | Phase 2.5 |
| ~~**3.0: AI Prereqs**~~ | ~~Markdown joiner, streaming port~~ | — | — | Incorporated into Phase 3 |
| **3: Inline AI** | (see `2026-04-17_phase3_inline_ai.md`) | 5-7 days | **Highest** | Phase 2.5 |
| **4: Graph Perf** | (original plan) | 3-5 days | Medium | None |
| **5: Frontmatter** | (original plan) | 2-3 days | Low | None |
| ~~**6: Code Drawings**~~ | ~~Mermaid/PlantUML live preview~~ | — | — | Already implemented |
| ~~**7: Git Sync**~~ | ~~Auto-commit + push/pull~~ | — | — | Already implemented |
| **7: Linked Notes** | List items → wiki links | 1 day | Low-Medium | Phase 2.5 |

## Recommended Implementation Order

```
Phase 2.5 (Block Ops) ──→ Phase 2.6 (Chunking) ──→ Phase 3 (Inline AI)
                      └──→ Phase 2.7 (Multi-Select, can parallel with 3)
                                                                        ──→ Phase 4 (Graph)
                                                                        ──→ Phase 5 (Frontmatter)
                                                                        ──→ Phase 7 (Linked Notes)
```

**Critical path:** 2.5 → 3 (Block Ops establish patterns, Phase 3 includes its own streaming infra)
**Quick win:** 2.6 (Chunking) can ship any time, 3 CSS lines.
**Parallelizable:** 2.7 (Multi-Select) can develop alongside Phase 3, merge later.
