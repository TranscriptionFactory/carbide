# Scratch & Moraya: Portable Components for Otterly

Reference document cataloging features from [scratch](~/src/scratch/) (React/Tauri/TipTap editor) and [moraya](~/src/moraya/) (Svelte/Tauri/ProseMirror editor) that can be ported to Otterly (SvelteKit/Tauri/Milkdown).

---

## Otterly Editor Baseline

What Otterly already has:

- **Editor**: Milkdown 7.18.0 (ProseMirror-based), 807-line adapter
- **Slash commands**: 13 commands (H1-H6, code block, table, bullet/ordered/task list, blockquote, divider)
- **Wiki links**: `[[path]]` / `[[path|label]]` with autocomplete, ref count badges, planned notes
- **Link tooltip**: Hover preview, edit mode (text + URL), copy/remove
- **Image handling**: Paste plugin, input rule (markdown syntax), block images with lazy loading, error placeholders
- **Code blocks**: Prism syntax highlighting, copy button
- **Find & highlight**: Regex search with match navigation
- **Outline**: Heading extraction with debounce, feeds sidebar TOC
- **Paste**: Markdown MIME detection, CRLF normalization, smart mode detection
- **Status bar**: Cursor pos, word/line count, save timestamp, git status, vault selector
- **Marks**: Bold, italic, code, strikethrough, links (non-inclusive handling)
- **Tables**: Insert via slash command (2x2), GFM support. **No editing toolbar, no alignment, no row/col operations**
- **Images**: Block-level with captions. **No resize, no context menu, no alt editing**
- **Code blocks**: Prism highlighting. **No language picker, no mermaid preview**

---

## Easy-to-Port Features

Features ranked by (value x ease of porting). Moraya features port easiest (same framework: Svelte, same engine: ProseMirror).

### 1. Table Toolbar

**Source**: moraya `src/lib/editor/TableToolbar.svelte` (168 lines)
**Effort**: Low (1-2 days)
**Value**: High — tables are currently insert-only, no way to edit structure

Floating toolbar appears when cursor is in a table cell. Operations:

- Add row before/after
- Add column before/after
- Delete row/column
- Cell alignment: left, center, right

Uses `prosemirror-tables` commands (`addRowBefore`, `addRowAfter`, `addColumnBefore`, `addColumnAfter`, `deleteRow`, `deleteColumn`). Otterly already has `prosemirror-tables` via GFM preset.

**What to port**:

- `TableToolbar.svelte` — adapt styling to Otterly's design tokens
- Add `alignment` attribute to table cell schema (Milkdown's GFM table cells)
- Wire toolbar visibility to cursor position (show when inside `table_cell`/`table_header`)
- Position toolbar above the table using Floating UI (already in Otterly's deps)

**Moraya also has**: `commands.ts` with full table command exports (`insertTable`, `addRowBefore/After`, `addColumnBefore/After`, `deleteRow/Column`, `deleteTable`). These map directly to prosemirror-tables.

---

### 2. Code Block Language Picker

**Source**: moraya `src/lib/editor/plugins/code-block-view.ts` (728 lines)
**Effort**: Low-Medium (2-3 days)
**Value**: High — no way to change code block language after creation

Pure DOM implementation (framework-agnostic). Features:

- Searchable dropdown with groups: Popular (20 langs), All, Renderer Plugins
- Auto-detect language via `hljs.highlightAuto()` (shown as suggestion at top)
- Language aliases for search (e.g. "js" finds JavaScript)
- Copy button with checkmark feedback
- Mermaid/renderer toggle: edit/preview mode per code block

**What to port**:

- Language picker logic → adapt for Milkdown's `$view()` or custom NodeView
- Language registry (POPULAR_LANGUAGES + ALL_LANGUAGES) — reusable data
- Auto-detect pattern — lazy-load hljs, confidence threshold (relevance > 5)
- Copy button already exists in Otterly; augment with language picker

---

### 3. Image Resize Toolbar

**Source**: moraya `src/lib/editor/ImageToolbar.svelte` (117 lines)
**Effort**: Low (1-2 days)
**Value**: High — images are fixed-size, no user control

Floating toolbar with preset size buttons:

- 25%, 50%, 75%, 100%, Original
- Active state highlight on current size
- Backdrop click to dismiss

**What to port**:

- `ImageToolbar.svelte` — adapt styling
- Add `width` attribute to Otterly's image-block schema
- Trigger toolbar on image click/select
- Apply width as inline style on image element

---

### 4. Mermaid Diagram Preview

**Source**: moraya `src/lib/editor/plugins/mermaid-renderer.ts` (92 lines) + code-block-view.ts
**Effort**: Medium (2-3 days)
**Value**: High — diagrams-as-code is a common note-taking need

Architecture:

- Lazy-loads mermaid library (~2.4 MB) only when first mermaid block encountered
- Serial render queue (mermaid.render() is not concurrency-safe)
- Theme-aware: reads CSS variables, re-renders on `data-theme` attribute change via MutationObserver
- Debounced rendering (150ms)
- Toggle between edit/preview via button in code block toolbar
- Click on preview enters edit mode
- Loading spinner + error display

**What to port**:

- `mermaid-renderer.ts` — copy verbatim (framework-agnostic)
- Code block NodeView with mermaid state (isEditing, lastRenderedCode)
- Theme observer pattern for re-render on theme switch
- Wire into Milkdown's code_block handling

---

### 5. Emoji Shortcodes

**Source**: moraya `src/lib/editor/plugins/emoji.ts` (65 lines)
**Effort**: Low (< 1 day)
**Value**: Medium — delightful micro-feature

ProseMirror plugin that converts `:shortcode:` to native emoji on typing the closing `:`.

- Uses `node-emoji` package for shortcode → emoji lookup
- Validates shortcode chars: `[a-zA-Z0-9_+-]`
- Scans backwards from cursor to find opening `:`
- Replaces the full `:shortcode:` range with emoji text node

**Dependency**: `node-emoji`

**What to port**:

- Wrap in Milkdown's `$prose()` plugin pattern
- Register in `milkdown_adapter.ts`
- Add to Tier 1 dynamic imports (non-critical enhancement)

---

### 6. Image Context Menu

**Source**: moraya `src/lib/editor/ImageContextMenu.svelte` (190 lines)
**Effort**: Low (1-2 days)
**Value**: Medium — right-click UX polish

Context menu on right-click of images:

- Resize submenu (25%, 50%, 75%, 100%, original)
- Copy image / Copy URL
- Upload (if uploadable)
- Edit alt text
- Open in browser (if remote URL)
- Save as (file dialog)
- Delete

**What to port**:

- `ImageContextMenu.svelte` — adapt to Otterly's styling
- Wire to right-click event on image nodes
- Integrate with image resize (Feature 3) and alt editor (Feature 7)

---

### 7. Image Alt Text Editor

**Source**: moraya `src/lib/editor/ImageAltEditor.svelte` (139 lines)
**Effort**: Low (< 1 day)
**Value**: Medium — accessibility improvement

Floating popup for editing image alt text:

- Auto-focus + select all on open
- Enter to save, Escape to cancel
- Clean label + input + action buttons

**What to port**:

- `ImageAltEditor.svelte` — adapt styling
- Wire to image context menu "Edit Alt" action
- Update image node `alt` attribute via ProseMirror transaction

---

### 8. Touch/Formatting Toolbar

**Source**: moraya `src/lib/editor/TouchToolbar.svelte` (133 lines)
**Effort**: Low (1 day)
**Value**: Medium — useful for mobile/tablet, also nice for mouse users who prefer buttons

Horizontally scrollable toolbar with grouped buttons:

- **Actions**: Undo, Redo
- **Format**: Bold, Italic, Strikethrough, Code, Link
- **Paragraph**: H1, H2, H3, Quote, Bullet list, Ordered list
- **Insert**: Code block, Math block, Table, Image, Horizontal rule

Uses command callback pattern: `onCommand(btn.id)` — decoupled from editor.

**What to port**:

- `TouchToolbar.svelte` — adapt styling to shadcn tokens
- Wire `onCommand` to Milkdown command dispatch
- Show conditionally (settings toggle or responsive breakpoint)

---

### 9. Syntax Highlight Caching

**Source**: moraya `src/lib/editor/plugins/highlight.ts` (315 lines)
**Effort**: Medium (2-3 days)
**Value**: Medium — performance improvement for code-heavy notes

Smarter than Otterly's Prism approach:

- Per-block FIFO cache (100 entries) keyed by `language + code`
- On keystroke: cheaply maps existing decorations via `tr.mapping` (no re-parse)
- Only schedules full re-highlight when change affects a `code_block` node
- 300ms debounce before re-highlight (dispatch metadata-only transaction)
- Uses hljs with tree-shakeable language imports (22 languages + aliases)
- Scope-to-class mapping for hljs v11 dotted scopes

**What to port**:

- Replace Prism plugin with hljs decoration plugin
- Port caching + debounce pattern
- Reuse language import list

---

### 10. Definition Lists

**Source**: moraya `src/lib/editor/plugins/definition-list.ts` (21 lines) + schema nodes in `schema.ts`
**Effort**: Medium (2-3 days)
**Value**: Low — niche but useful for technical documentation

Three schema nodes: `defList` (`<dl>`), `defListTerm` (`<dt>`), `defListDescription` (`<dd>`).
Input rule: `:   ` (colon + 3 spaces) wraps in definition description.
Markdown parsing via `markdown-it-deflist` plugin.

**What to port**:

- Add nodes to Milkdown schema (or custom ProseMirror schema extension)
- Add `markdown-it-deflist` to markdown parser config
- Port input rule
- Add serializer for roundtrip

---

## Scratch-Specific Features

Features only in scratch (React/TipTap), not in moraya.

### 11. Table Grid Picker

**Source**: scratch `src/components/editor/Editor.tsx` (lines 2117-2290)
**Effort**: Low (1 day)
**Value**: Medium — better UX than fixed 2x2 insertion

Visual 5x5 grid for choosing table dimensions. Hover highlights cells to show size. Click creates table with selected dimensions.

**What to port**:

- Build Svelte component for grid picker
- Wire to slash command `/table` (replace fixed 2x2 with picker)

---

### 12. Frontmatter Support

**Source**: scratch `src/components/editor/Frontmatter.ts`
**Effort**: Medium (2-3 days)
**Value**: Medium — useful for static site / publishing workflows

Custom node type for YAML frontmatter (`---`...`---`) at document start. Special parsing/rendering, excluded from slash commands and code blocks.

---

### 13. Formatting Bar (Desktop)

**Source**: scratch `src/components/editor/Editor.tsx` (lines 204-388)
**Effort**: Medium (2-3 days)
**Value**: Medium — comprehensive desktop toolbar

Full formatting bar with active-state buttons: Bold, Italic, Strikethrough, Code, H1-H4, Bullet/Ordered/Task list, Blockquote, Code block, Math, Link, Wikilink, Image, Table (with grid picker), HR.

Moraya's `TouchToolbar` is simpler and already Svelte — better starting point for Otterly (Feature 8).

---

## Previously Cataloged Features

These were documented earlier and have detailed plans in `scratch_highvalue.md`:

| Feature                          | Status  | Reference                               |
| -------------------------------- | ------- | --------------------------------------- |
| Git Remote Ops (push/pull/fetch) | Planned | scratch_highvalue.md Feature 1          |
| AI CLI Integration               | Planned | scratch_highvalue.md Feature 2          |
| Contextual Commands              | Planned | scratch_highvalue.md Feature 3          |
| Focus/Zen Mode                   | Planned | scratch_highvalue.md Feature 4          |
| Editor Width Presets             | Planned | scratch_highvalue.md Feature 5          |
| Math/LaTeX Support               | Planned | scratch_highvalue.md Feature 6          |
| Tantivy Search                   | Skipped | Otterly's FTS5 is comparable            |
| Wikilinks                        | Skipped | Otterly's implementation is more mature |

---

## Dependency Summary

NPM packages to add:

```
node-emoji          # emoji shortcode → native emoji (Feature 5)
mermaid             # diagram rendering (Feature 4, lazy-loaded)
highlight.js        # if replacing Prism with hljs caching (Feature 9)
```

No new Rust crates needed for editor features.
