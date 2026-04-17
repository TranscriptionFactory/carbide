# Mdit Port Implementation Plan

**Date:** 2026-04-17
**Reference:** `carbide/research/mdit_comparison.md`

---

## Overview

Items to port from mdit, ordered by value and grouped into phases. Each phase is independently shippable.

---

## Phase 1: Quick Wins — COMPLETED (2026-04-17)

Low-effort, high-polish improvements. No architectural changes.

### 1.1 Insert Handle (+) on Block Drag — DONE
**Files:** `src/lib/features/editor/adapters/block_drag_handle_plugin.ts`, `src/styles/editor.css`

- Added `block-drag-handle__insert` element (CSS plus icon via `::before`/`::after` pseudo-elements) to the left of the grip handle
- On click: inserts empty paragraph below current block, sets cursor there, focuses editor
- Handle container widened to `auto` width, repositioned to `-left-1.75rem` to accommodate both buttons
- `mousedown` on insert button prevents drag initiation via `stopPropagation`

### 1.2 Focus Mode (Auto-Hide Handles While Typing) — DONE
**Files:** `block_drag_handle_plugin.ts`, `src/styles/editor.css`

- Keystroke counter on `keydown` (threshold: 4), resets on `mousemove`
- After threshold: adds `.typing-focus` class to editor DOM
- CSS: `.typing-focus .block-drag-handle { opacity: 0 !important; pointer-events: none; }`
- Clean teardown in plugin `destroy()`

### 1.3 Code Block Language Memory — DONE
**Files:** `src/lib/features/editor/adapters/slash_command_plugin.ts`

- Added `find_last_code_block_language(doc)` — scans doc descendants for last `code_block` node with non-empty `language` attr
- `make_code_block_insert()` now calls it before inserting, using result as default language
- Tests: `tests/unit/adapters/code_block_language_memory.test.ts` (3 tests)

### 1.4 Markdown Fallback Deserialization Chain — DONE
**Files:** `src/lib/features/editor/adapters/markdown_pipeline.ts`, `src/lib/features/editor/adapters/remark_plugins/remark_processor.ts`

- `parse_markdown()` wrapped in try/catch
- On failure: retries with `fallback_parse_processor` (drops math, highlight, details plugins)
- On second failure: returns minimal valid doc (single empty paragraph) via `create_empty_doc()`
- Both failures logged via `console.warn` with context
- Tests: `tests/unit/adapters/markdown_fallback_parse.test.ts` (3 tests)

---

## Phase 2: Callout Blocks — COMPLETED (2026-04-17)

Obsidian-compatible callout syntax support.

### 2.1 Remark Plugin — DONE
**New file:** `src/lib/features/editor/adapters/remark_plugins/remark_callout.ts`

- `remark_callout` plugin transforms blockquotes with `[!type]` first line → `callout` MDAST nodes with `calloutTitle` + `calloutBody` children
- 28 supported types: note, abstract, summary, tldr, info, todo, tip, hint, important, success, check, done, question, help, faq, warning, caution, attention, failure, fail, missing, danger, error, bug, example, quote, cite
- Canonical type normalization (e.g., `tldr` → `abstract`, `caution` → `warning`)
- Preserves foldable state (`+` = open, `-` = closed) and custom titles
- `callout_to_markdown` serializer: outputs `> [!type]` blockquote syntax with body lines prefixed by `>`
- `parse_callout_directive()` and `format_callout_directive()` utility functions exported for reuse

### 2.2 ProseMirror Node — DONE
**Files:** `schema.ts`, `mdast_to_pm.ts`, `pm_to_mdast.ts`

- Added `callout` node type to schema: attrs `{ callout_type, foldable, default_folded }`, content `callout_title callout_body`
- Added `callout_title` (inline content, isolating) and `callout_body` (block+ content) helper nodes
- `convert_callout()` in mdast_to_pm: converts callout MDAST → PM callout node with title inline and body blocks
- `convert_block_node` case in pm_to_mdast: serializes back to callout MDAST with data attrs and children

### 2.3 Editor Extension — DONE
**Files:** `callout_view_plugin.ts`, `callout_extension.ts`, `extensions/index.ts`, `editor.css`

- `CalloutBlockView` node view: renders callout with icon + content DOM container
- Lucide SVG icons per canonical type (14 icons: pencil, clipboard-list, info, circle-check, flame, check, circle-help, triangle-alert, x, zap, bug, list, quote, message-circle-warning)
- CSS: colored left border + tinted background per type using `--callout-color` custom property (OKLCH colors)
- Title rendered bold with type color, body content below
- Wired into `assemble_extensions()` via `create_callout_extension()`

### 2.4 Slash Command — DONE
**Files:** `slash_command_plugin.ts`

- Added `make_callout_insert(callout_type)` factory function
- 5 callout slash commands: Note, Warning, Tip, Important, Example
- Keywords include "callout", "admonition", and type-specific terms
- Insert creates callout with pre-filled title, cursor positioned in body

### 2.5 Tests — DONE
**File:** `tests/unit/adapters/callout_roundtrip.test.ts` (18 tests)

- Directive parsing: basic note, custom title, foldable open/closed, unknown types, non-callout text
- Directive formatting: basic, custom title, foldable
- Markdown roundtrip: basic parse, custom title, roundtrip serialization, foldable state preservation, regular blockquote passthrough, direct schema construction, multi-paragraph body, empty body

---

## Phase 3: Inline AI Menu + Streaming (5-7 days)

The highest-value port. Brings AI from sidebar-only to inline editing flow.

### 3.1 AI Menu Plugin
**New file:** `src/lib/features/editor/adapters/ai_menu_plugin.ts`

- Trigger: keyboard shortcut (Cmd+J or configurable) when text selected
- UI: floating popover anchored below selection (use `@floating-ui/dom`)
- Content: model picker dropdown, command list, custom prompt input
- Commands: Improve, Simplify, Expand, Summarize, Fix grammar, Translate, Explain, Custom
- Dismiss: Escape, click outside, empty selection

### 3.2 Streaming Text Insertion
**Files:** `ai_menu_plugin.ts`, `src/lib/features/ai/application/ai_service.ts`

- On command submit: show loading indicator in popover
- Stream AI response chunks → insert as ProseMirror transactions
- During streaming: highlight inserted range with decoration (light blue background)
- Animated cursor dot at end of streaming text
- On complete: remove highlight, show accept/reject buttons
- Accept: keep text, dismiss menu
- Reject: undo all insertions, restore original text

### 3.3 AI Vault Tools
**Files:** `src/lib/features/ai/application/ai_service.ts`, `ai_types.ts`

- Define tool schemas for AI providers:
  - `search_notes(query: string)` → returns matching note excerpts
  - `read_note(path: string)` → returns note content
  - `edit_note(path: string, instructions: string)` → applies edit
  - `create_note(path: string, content: string)` → creates new note
- Wire through AiPort abstraction
- Tool results fed back into conversation context

### 3.4 Custom AI Commands
**Files:** `src/lib/features/ai/state/ai_store.svelte.ts`, settings UI

- Data model: `{ id: string, label: string, prompt_template: string, mode: "edit" | "ask" }`
- Prompt template supports placeholders: `{selection}`, `{note_title}`, `{note_path}`
- Store in vault settings (persisted)
- Surface in AI menu command list alongside built-in commands
- Settings UI: add/edit/remove custom commands

### 3.5 Multi-Provider Support (Optional — extends existing AiPort)
- Evaluate Vercel AI SDK (`ai` package) for unified streaming across providers
- If adopted: replace CLI/API transport with SDK-based transport
- Providers: OpenAI, Anthropic, Gemini, Ollama
- If not: keep current AiPort but add streaming support to API transport

---

## Phase 4: Graph Performance (3-5 days)

Switch graph rendering from SVG to Canvas for large vault scalability.

### 4.1 Canvas Renderer
**Files:** `src/lib/features/graph/ui/vault_graph_canvas.svelte` (or new component)

- Replace SVG rendering with HTML5 Canvas API
- Draw nodes as circles (filled, with label text)
- Draw edges as lines/bezier curves
- Leverage existing spatial_index.ts for hit testing (already compatible)
- Keep SVG as fallback for accessibility or export

### 4.2 Degradation Profiles
**New file:** `src/lib/features/graph/domain/graph_degrade.ts`

- Define thresholds: 220 nodes, 800 edges
- Profile controls:
  - `tick_cap`: 80-220 (simulation iterations)
  - `edge_render_limit`: 500 minimum
  - `label_visibility_scale`: hide labels when zoomed out past threshold
- Apply profiles in layout + render loops

### 4.3 Stochastic Edge Sampling
**Files:** graph render loop

- When edge count exceeds render limit: sample subset
- Priority: unresolved edges > edges connected to selected/hovered node > random
- Re-sample on each frame for visual stability
- Full edges rendered when zoomed in sufficiently

### 4.4 Node Radius by Degree
**Files:** `vault_graph_renderer.ts`

- `radius = Math.min(6, 2.2 + Math.sqrt(Math.max(degree, 1)) * 0.7)`
- Unresolved nodes: fixed small radius (1.8)
- Visual hierarchy: highly-connected notes appear larger

### 4.5 Smooth View Interpolation
**Files:** graph canvas component

- Lerp camera position on pan/zoom with factor 0.24
- `camera.x += (target.x - camera.x) * 0.24` per frame
- Smooth zoom transitions on mouse wheel (sensitivity 0.0016)

---

## Phase 5: Frontmatter Visual Editor (2-3 days)

Optional. Visual table editor for YAML frontmatter.

### 5.1 Frontmatter Table Node
- Replace raw YAML display with key-value table UI
- Auto-detect value types: string, number, boolean, tags (comma/space-separated), date
- Editable cells with type-appropriate inputs
- Add/remove rows
- Serialize back to YAML `---` block

### 5.2 Integration
- Render as first block in visual editor (above title or replacing frontmatter guard)
- Guard: prevent accidental deletion of frontmatter block
- Source mode: show raw YAML as usual

---

## Phase Summary

| Phase | Items | Effort | Value |
|---|---|---|---|
| **1: Quick Wins** | Insert handle, focus mode, lang memory, fallback parse | 1-2 days | Polish |
| **2: Callouts** | Remark plugin, PM node, extension, slash cmd | 2-3 days | Feature parity with Obsidian |
| **3: Inline AI** | AI menu, streaming, vault tools, custom cmds | 5-7 days | **Highest value** |
| **4: Graph Perf** | Canvas render, degradation, sampling, interpolation | 3-5 days | Scalability |
| **5: Frontmatter** | Visual YAML editor | 2-3 days | Nice-to-have |

**Recommended order:** Phase 1 → Phase 3 → Phase 2 → Phase 4 → Phase 5

Phase 1 is quick polish. Phase 3 (inline AI) is the biggest competitive gap and should follow immediately. Callouts and graph perf can be done in either order. Frontmatter editor is lowest priority.

---

## Dependencies & Risks

- **Phase 3** depends on choosing whether to adopt Vercel AI SDK or extend current AiPort. Decision needed before starting.
- **Phase 4** (Canvas rendering) may require rethinking accessibility — Canvas doesn't have DOM nodes for screen readers. Keep SVG as export/accessibility fallback.
- **Phase 2** (Callouts) requires remark plugin that must roundtrip cleanly. Test with Obsidian-exported files.
- All phases are independent and can be developed on separate branches.
