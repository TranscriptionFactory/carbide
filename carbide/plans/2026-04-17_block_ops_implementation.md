# Implementation Plan: Phases 2.5, 2.6, 2.7

**Date:** 2026-04-17
**Depends on:** `2026-04-17_mdit_port_addendum.md`
**Branch:** `feat/block-ops`

---

## Architecture Notes (from codebase exploration)

**Key patterns discovered:**

- **Domain layer** (`src/lib/features/editor/domain/`) contains pure functions over plain data. However, block transforms will need ProseMirror `state`/`dispatch` — these belong in **adapters** (like `heading_fold_plugin.ts`), not domain.
- **Action registry:** Editor actions live in `src/lib/app/orchestration/app_actions.ts`, registered via `services.editor.*`. Action IDs in `action_ids.ts`.
- **Editor service** delegates to `session.toggle_heading_fold()` etc — thin pass-through to ProseMirror view-level functions.
- **Schema** (`src/lib/features/editor/adapters/schema.ts`) exports typed node specs: `paragraph`, `heading` (attrs: `level`, `id`), `blockquote`, `bullet_list`, `ordered_list`, `list_item`, `code_block`, `callout` (with `callout_title`, `callout_body`), etc.
- **Context menu** (`editor_context_menu.svelte`) uses shadcn `ContextMenu.*` components, `use_app_context()` for stores/registry, `execute(ACTION_IDS.xxx)` pattern.
- **Extensions** assembled in `extensions/index.ts` via `assemble_extensions()`. Each returns `{ plugins: Plugin[] }`.
- **Keymaps** in `core_extension.ts` use ProseMirror `keymap({...})` with `(state, dispatch?) => boolean` commands.
- **Tests** import `schema` from `$lib/features/editor/adapters/schema`, build docs via `schema.nodes.doc.create(null, [...])`, create `EditorState.create({ doc, plugins })`.
- **`compute_heading_ranges(doc)`** in `heading_fold_plugin.ts` returns `HeadingRange[]` with `{ heading_pos, heading_end, body_start, body_end, level }`.

**Deviation from addendum:** The addendum places `block_transforms.ts` in `domain/`. Since these functions operate on ProseMirror `EditorState`/`dispatch`, they are **adapter-layer** code. File goes to `src/lib/features/editor/adapters/block_transforms.ts`. Tests confirm this pattern — `heading_fold_plugin.ts` (also ProseMirror-coupled) lives in adapters.

---

## Phase 2.5: Block Operations

### Step 1: Create `block_transforms.ts` (adapters layer)

**File:** `src/lib/features/editor/adapters/block_transforms.ts`

Core helper — resolve the top-level block at cursor:

```ts
import type { EditorState, Transaction } from "prosemirror-state";
import type { NodeType } from "prosemirror-model";
import { schema } from "./schema";

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

function resolve_block_at_cursor(state: EditorState): { pos: number; node: Node; end: number } | null
```

Walks `state.selection.$from` upward to find the top-level block (depth 1 in doc). Returns `{ pos, node, end }` or null.

#### 1a. `turn_into` commands

One factory function that produces a ProseMirror command for each target type:

```ts
export function create_turn_into_command(
  target_type: "paragraph" | "heading" | "blockquote" | "bullet_list" | "ordered_list" | "todo_list" | "code_block" | "callout",
  attrs?: Record<string, unknown>,
): Command
```

**Logic per target:**

| Target | From simple block | From wrapped block (blockquote/list) |
|---|---|---|
| `paragraph` | `setBlockType(paragraph)` | `lift()` then `setBlockType` |
| `heading` | `setBlockType(heading, { level })` | `lift()` then `setBlockType` |
| `blockquote` | `wrapIn(blockquote)` | if already blockquote, no-op |
| `bullet_list` | wrap in `bullet_list > list_item` | lift from old list, re-wrap |
| `ordered_list` | wrap in `ordered_list > list_item` | lift from old list, re-wrap |
| `todo_list` | wrap in `bullet_list > list_item({ checked: false })` | lift + re-wrap |
| `code_block` | `setBlockType(code_block)` — strips marks | lift if wrapped, then convert |
| `callout` | `replaceWith` callout structure (callout > callout_title + callout_body > paragraph) | lift + replace |

Edge cases:
- No-op when target matches current type (return `false`)
- `code_block → paragraph` strips code-only attrs
- Heading gains `level` attr from `attrs`
- Content preservation: inline content and marks carried through `setBlockType`; `wrapIn`/`lift` preserve content by definition
- Works at any depth: resolve to the nearest block ancestor of the selection

Import `lift`, `wrapIn`, `setBlockType` from `prosemirror-commands`; `wrapInList`, `liftListItem` from `prosemirror-schema-list`.

#### 1b. `duplicate_block`

```ts
export function duplicate_block(state: EditorState, dispatch?: (tr: Transaction) => void): boolean
```

- Resolve top-level block at cursor
- **Heading**: use `compute_heading_ranges(state.doc)` to find section range → slice `heading_pos..body_end` → insert after section
- **Other blocks**: `node.copy(node.content)` → insert after node
- Move cursor to start of duplicated block
- Single undo step (one transaction)

#### 1c. `delete_block`

```ts
export function delete_block(state: EditorState, dispatch?: (tr: Transaction) => void): boolean
```

- Resolve top-level block at cursor
- **Heading**: delete only the heading node; children (body paragraphs etc.) stay and promote to parent level
- **Other blocks**: delete the node, cursor → previous block end or next block start
- Guard: don't delete if it's the last node in doc (replace with empty paragraph instead)

### Step 2: Action IDs

**File:** `src/lib/app/action_registry/action_ids.ts`

Add to `ACTION_IDS`:

```ts
editor_turn_into_paragraph: "editor.turn_into.paragraph",
editor_turn_into_heading_1: "editor.turn_into.heading_1",
editor_turn_into_heading_2: "editor.turn_into.heading_2",
editor_turn_into_heading_3: "editor.turn_into.heading_3",
editor_turn_into_blockquote: "editor.turn_into.blockquote",
editor_turn_into_bullet_list: "editor.turn_into.bullet_list",
editor_turn_into_ordered_list: "editor.turn_into.ordered_list",
editor_turn_into_todo_list: "editor.turn_into.todo_list",
editor_turn_into_code_block: "editor.turn_into.code_block",
editor_turn_into_callout: "editor.turn_into.callout",
editor_duplicate_block: "editor.duplicate_block",
editor_delete_block: "editor.delete_block",
```

### Step 3: Wire through editor service + session

**File:** `src/lib/features/editor/application/editor_service.ts`

Add methods that delegate to session (same pattern as `toggle_heading_fold`):

```ts
turn_into(target: string, attrs?: Record<string, unknown>) { this.session?.turn_into?.(target, attrs); }
duplicate_block() { this.session?.duplicate_block?.(); }
delete_block() { this.session?.delete_block?.(); }
```

**File:** Editor session (wherever `toggle_heading_fold` is implemented on the session object)

Wire these to call the ProseMirror commands on the view:

```ts
turn_into(target, attrs) {
  const cmd = create_turn_into_command(target, attrs);
  cmd(this.view.state, this.view.dispatch);
}
duplicate_block() { duplicate_block(this.view.state, this.view.dispatch); }
delete_block() { delete_block_cmd(this.view.state, this.view.dispatch); }
```

### Step 4: Register actions

**File:** `src/lib/app/orchestration/app_actions.ts`

Add registrations in `register_app_actions`:

```ts
registry.register({
  id: ACTION_IDS.editor_turn_into_paragraph,
  label: "Turn Into Paragraph",
  execute: () => services.editor.turn_into("paragraph"),
});
// ... one per turn_into target

registry.register({
  id: ACTION_IDS.editor_duplicate_block,
  label: "Duplicate Block",
  execute: () => services.editor.duplicate_block(),
});

registry.register({
  id: ACTION_IDS.editor_delete_block,
  label: "Delete Block",
  execute: () => services.editor.delete_block(),
});
```

### Step 5: Context menu integration

**File:** `src/lib/features/editor/ui/editor_context_menu.svelte`

Add three sections (always visible, not gated on IWE):

1. **"Turn Into" submenu** — items: Paragraph, Heading 1/2/3, Blockquote, Bullet List, Ordered List, Todo List, Code Block, Callout. Each calls `execute(ACTION_IDS.editor_turn_into_*)`.
2. **"Duplicate" item** — shortcut hint `⇧⌘D`
3. **"Delete" item** — separator before it for visual grouping

Place these **above** the existing IWE-gated Refactor submenu, with a separator between block ops and refactor.

### Step 6: Keyboard shortcuts

**File:** `src/lib/features/editor/extensions/core_extension.ts`

Add keymaps:

```ts
"Mod-Shift-0": create_turn_into_command("paragraph"),
"Mod-Shift-1": create_turn_into_command("heading", { level: 1 }),
"Mod-Shift-2": create_turn_into_command("heading", { level: 2 }),
"Mod-Shift-3": create_turn_into_command("heading", { level: 3 }),
"Mod-Shift-d": duplicate_block,
```

Check for conflicts with existing keymaps first (Mod-Shift-D is currently unbound based on exploration).

### Step 7: Tests

**File:** `tests/unit/adapters/block_transforms.test.ts`

Use `@vitest-environment jsdom`. Import `schema` from adapters. Build docs with `schema.nodes.*`.

**turn_into scenarios:**
1. Paragraph → heading 1/2/3 preserves inline content and marks (bold, italic)
2. Heading → paragraph preserves inline content
3. Heading → different-level heading changes level attr
4. Paragraph → blockquote wraps correctly
5. Blockquote → paragraph lifts correctly
6. Paragraph → bullet list creates `bullet_list > list_item > paragraph` structure
7. Paragraph → ordered list creates `ordered_list > list_item > paragraph`
8. List item in bullet list → ordered list type converts
9. Code block → paragraph strips code attrs, preserves text
10. Paragraph → callout creates `callout > callout_title + callout_body > paragraph`
11. No-op when target matches current type (returns false)
12. Cursor position preserved after conversion
13. Works inside blockquote (blockquote > paragraph → heading)

**duplicate_block scenarios:**
1. Duplicate paragraph creates identical sibling below
2. Duplicate heading duplicates entire section (heading + body until next same-level heading)
3. Duplicate code block preserves language attr
4. Duplicate callout preserves type, foldable, title, body
5. Duplicate list item duplicates single item, not entire list
6. Cursor moves to start of duplicated block
7. Undo reverts in single step

**delete_block scenarios:**
1. Delete paragraph removes it, cursor at prev block end
2. Delete heading keeps children, cursor at prev block end
3. Delete last block replaces with empty paragraph
4. Delete first block moves cursor to next block start

---

## Phase 2.6: Content-Visibility Chunking

### Step 1: CSS-only approach (Option A)

**File:** `src/styles/editor.css`

Add 3 lines:

```css
.ProseMirror > *:not(.ProseMirror-selectednode) {
  content-visibility: auto;
  contain-intrinsic-block-size: auto 3rem;
}
```

### Step 2: Validation

- Manual test: open a 200+ block document, confirm no layout shift
- Confirm cursor rendering still works on selected blocks
- Confirm ProseMirror's find plugin (model-level) still works
- Browser Ctrl+F caveat: accepted limitation (ProseMirror's find is primary)

### Step 3: Fallback plan

Only if Option A causes issues (selection rendering, scroll-to-cursor bugs):
- Create `src/lib/features/editor/adapters/content_visibility_plugin.ts`
- Plugin wraps every ~80 blocks in `<div class="editor-chunk">` with `content-visibility: auto`
- Wire into `assemble_extensions()` in `extensions/index.ts`

No automated tests for this phase — it's pure CSS. Visual + perf verification during manual QA.

---

## Phase 2.7: Multi-Block Selection

### Step 1: Plugin state + decoration plugin

**File:** `src/lib/features/editor/adapters/block_selection_plugin.ts`

```ts
import { Plugin, PluginKey } from "prosemirror-state";
import { DecorationSet, Decoration } from "prosemirror-view";

export const block_selection_plugin_key = new PluginKey<BlockSelectionState>("block-selection");

type BlockSelectionState = {
  selected_positions: Set<number>;  // top-level block positions
  anchor_pos: number | null;        // first block selected (for range extension)
};

type BlockSelectionMeta =
  | { action: "toggle"; pos: number }
  | { action: "extend"; pos: number }       // Shift+arrow range
  | { action: "clear" }
  | { action: "set"; positions: number[] };  // programmatic set
```

**Plugin behavior:**

- **State `init`:** `{ selected_positions: new Set(), anchor_pos: null }`
- **State `apply`:**
  - On meta: handle toggle/extend/clear/set
  - On doc change: remap positions through `tr.mapping`, drop any that are no longer valid
- **`props.decorations`:** Build `DecorationSet` from `selected_positions` — each gets a `Decoration.node(pos, pos + node.nodeSize, { class: "block-selected" })`
- **`props.handleKeyDown`:**
  - `Shift+ArrowDown`: extend selection to next top-level block
  - `Shift+ArrowUp`: extend selection to previous top-level block
  - `Escape`: clear selection (if any selected)
  - Return `false` for all other keys (let them pass through)
- **`props.handleDOMEvents.mousedown`:**
  - If `Shift+click` on a block: toggle that block's position in selection
  - Determine block position from click coordinates via `view.posAtCoords()`
  - Resolve to top-level block

**Exported API:**

```ts
export function get_block_selection(state: EditorState): Set<number>
export function clear_block_selection(view: EditorView): void
export function create_block_selection_plugin(): Plugin
```

### Step 2: CSS

**File:** `src/styles/editor.css`

```css
.block-selected {
  background: color-mix(in oklch, var(--primary) 8%, transparent);
  outline: 1px solid color-mix(in oklch, var(--primary) 25%, transparent);
  border-radius: 2px;
}
```

### Step 3: Wire plugin into extensions

**File:** `src/lib/features/editor/extensions/index.ts`

Import and add `create_block_selection_plugin()` to `assemble_extensions()`. Place after `block_drag_handle_extension` (related functionality).

### Step 4: Batch support in block_transforms

**File:** `src/lib/features/editor/adapters/block_transforms.ts`

Extend the existing functions with optional `positions` parameter:

```ts
export function create_turn_into_command(
  target: string,
  attrs?: Record<string, unknown>,
  positions?: Set<number>,    // if provided, operate on these blocks
): Command

export function duplicate_block(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  positions?: Set<number>,
): boolean

export function delete_block(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  positions?: Set<number>,
): boolean
```

When `positions` is provided:
- Sort positions in **reverse document order** (highest first) to avoid position shifts during mutation
- Apply the transform to each block in a single transaction
- After batch operation, clear the block selection via meta

### Step 5: Context menu integration for multi-select

**File:** `src/lib/features/editor/ui/editor_context_menu.svelte`

- Import `block_selection_plugin_key` and `get_block_selection`
- Derive `block_selection_count` from editor state (via stores/editor view)
- When `block_selection_count > 1`: show count badge in menu header ("N blocks selected")
- Turn Into, Duplicate, Delete actions pass the `positions` set through to the commands
- Wire through editor service: `turn_into(target, attrs, positions?)`, `duplicate_block(positions?)`, `delete_block(positions?)`

### Step 6: Tests

**File:** `tests/unit/adapters/block_selection_plugin.test.ts`

Use `@vitest-environment jsdom`.

**Selection scenarios:**
1. Toggle adds a block to selection
2. Toggle again removes it
3. Extend (Shift+Down) adds next block
4. Extend (Shift+Up) adds previous block
5. Escape clears selection
6. Doc change remaps positions correctly
7. Deleting a selected block removes its position from selection

**Batch operation scenarios:**
8. Batch turn_into converts all selected blocks
9. Batch delete removes all selected blocks in single undo step
10. Batch duplicate duplicates all selected blocks in order
11. After batch operation, selection is cleared

---

## Implementation Status

### Phase 2.5 — DONE (commit `e6bbb850` on `feat/block-ops`)

All 7 steps completed:

1. **`block_transforms.ts`** — Created at `src/lib/features/editor/adapters/block_transforms.ts`. Uses direct transaction construction (not command chaining) for wrapped→unwrapped conversions. `unwrap_to_textblocks()` + `replace_block_with()` pattern avoids fragile lift-then-setBlockType command composition.
2. **Action IDs** — 12 new IDs added to `action_ids.ts` (`editor_turn_into_*`, `editor_duplicate_block`, `editor_delete_block`).
3. **Service/session wiring** — `EditorService.turn_into/duplicate_block/delete_block` → ports type → `prosemirror_adapter.ts` session methods.
4. **App actions** — All 12 registered in `register_app_actions`.
5. **Context menu** — Turn Into submenu (with separators grouping related items), Duplicate (⇧⌘D hint), Delete (with separator). Block ops above IWE-gated Refactor submenu.
6. **Keymaps** — `Mod-Shift-0/1/2/3` (paragraph, H1/2/3), `Mod-Shift-d` (duplicate) in `core_extension.ts`.
7. **Tests** — 19 tests covering turn_into (13), duplicate (5), delete (4). All passing.

**Design decisions:**
- Wrapped block conversions (blockquote/list → anything) use manual `replaceWith` transactions instead of `lift()` + `setBlockType()` command composition. This avoids the fundamental ProseMirror limitation where chaining commands requires intermediate state application that breaks single-transaction undo semantics.
- `todo_list` is `bullet_list > list_item({ checked: false })` (no separate node type).
- `callout` conversion places original content in `callout_body > paragraph`, leaves `callout_title` empty.

### Phase 2.6 — TODO (independent, can be done in any order)

Steps from plan above. 3 lines of CSS in `src/styles/editor.css`.

### Phase 2.7 — TODO (depends on Phase 2.5)

Steps from plan above. Key files to create/edit:
- `src/lib/features/editor/adapters/block_selection_plugin.ts` (NEW)
- `src/lib/features/editor/extensions/index.ts` (wire plugin)
- `src/lib/features/editor/adapters/block_transforms.ts` (add `positions?` param for batch ops)
- `src/lib/features/editor/ui/editor_context_menu.svelte` (multi-select badge + pass positions)
- `src/styles/editor.css` (`.block-selected` style)
- `tests/unit/adapters/block_selection_plugin.test.ts` (NEW)
- Also update `editor_service.ts`, `ports.ts`, `prosemirror_adapter.ts` to pass positions through

---

## Files Summary

| File | Action | Phase | Status |
|---|---|---|---|
| `src/lib/features/editor/adapters/block_transforms.ts` | NEW | 2.5, 2.7 | 2.5 done |
| `src/lib/app/action_registry/action_ids.ts` | EDIT | 2.5 | done |
| `src/lib/app/orchestration/app_actions.ts` | EDIT | 2.5 | done |
| `src/lib/features/editor/application/editor_service.ts` | EDIT | 2.5 | done |
| `src/lib/features/editor/adapters/prosemirror_adapter.ts` | EDIT | 2.5 | done |
| `src/lib/features/editor/ports.ts` | EDIT | 2.5 | done |
| `src/lib/features/editor/ui/editor_context_menu.svelte` | EDIT | 2.5, 2.7 | 2.5 done |
| `src/lib/features/editor/extensions/core_extension.ts` | EDIT | 2.5 | done |
| `tests/unit/adapters/block_transforms.test.ts` | NEW | 2.5, 2.7 | 2.5 done |
| `src/styles/editor.css` | EDIT | 2.6, 2.7 | TODO |
| `src/lib/features/editor/adapters/block_selection_plugin.ts` | NEW | 2.7 | TODO |
| `src/lib/features/editor/extensions/index.ts` | EDIT | 2.7 | TODO |
| `tests/unit/adapters/block_selection_plugin.test.ts` | NEW | 2.7 | TODO |
