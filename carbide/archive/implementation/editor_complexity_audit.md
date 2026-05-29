# Editor Complexity Audit: Carbide vs Obsidian

**Date**: 2026-04-23
**Scope**: `src/lib/features/editor/` — 100+ files across extensions, adapters, domain, state, application, and UI layers

---

## Executive Summary

Carbide's editor module has **~100 files** in `adapters/` and `extensions/` alone. Investigation reveals a mix of justified complexity (driven by ProseMirror's architecture and the MD↔PM roundtrip) and genuine overcomplication (duplicated suggest plugins, redundant image handlers, thin wrapper extensions). The highest-impact simplification — collapsing four nearly-identical suggest plugins into a generic factory — would eliminate **~1,200 lines** of mechanical duplication with zero feature loss.

Obsidian avoids most of this complexity by using CodeMirror 6 (flat text buffer + decorations) instead of ProseMirror (structured node tree). This sidesteps the MD↔PM impedance mismatch entirely but trades away structured editing, schema validation, and natural Yjs collaboration. **The ProseMirror choice is defensible for Carbide's goals; the complexity it introduces is the cost, and most of it is well-managed. But several areas have grown beyond what the architecture demands.**

---

## Finding 1: Suggest Plugin Duplication (Critical)

**Files**: `wiki_suggest_plugin.ts` (544 lines), `tag_suggest_plugin.ts` (413), `image_suggest_plugin.ts` (398), `cite_suggest_plugin.ts` (389)

**Problem**: These four plugins are **~73% identical boilerplate**. They share verbatim:
- Plugin state variables (`dropdown`, `is_visible`, `debounce_timer`, `suppress_next_activation`, `dismissed_query`, `dismissed_from`, `detach_dismiss`)
- `show_dropdown()`, `hide_dropdown()`, `dismiss()`, `sync_dropdown()` — identical implementations
- ProseMirror `state.apply` reducer — same two-branch pattern
- `view()` factory body — same create/mount/attach sequence
- `handleKeyDown` — same ArrowUp/Down/Enter/Escape (Tab varies slightly)
- `update()` guard sequence — same 7-step pattern

**What actually varies per plugin** (25-30% of each file):
1. `extract(text_before)` — the trigger regex
2. `render_item(item)` — how each row renders
3. `build_replacement(item)` — what to insert on accept

**What Obsidian does instead**: Obsidian's `EditorSuggest<T>` is an abstract class with two core methods:

```ts
abstract onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null)
  : EditorSuggestTriggerInfo | null;
abstract getSuggestions(context: EditorSuggestContext): T[] | Promise<T[]>;
```

The framework owns all lifecycle, keyboard nav, positioning, and dismiss logic. Plugin authors write ~40-150 lines per suggest type. A complete wiki-link suggest plugin fits in a single file.

**Recommendation**: Create `create_suggest_prose_plugin<TItem>(config: SuggestConfig<TItem>)` — a generic factory. Each plugin becomes a 20-40 line config object. Estimated reduction: **~1,200 lines**.

```ts
type SuggestConfig<TItem> = {
  key: PluginKey;
  class_name: string;
  extract: (text_before: string) => { query: string; from_offset: number } | null;
  render_item: (item: TItem, index: number, selected: boolean) => HTMLElement;
  build_replacement: (item: TItem, state: SuggestState<TItem>) => string;
  on_query: (query: string) => void;
  debounce_ms?: number;
  tab_behavior?: "lcp" | "cycle" | "none";
};
```

**Priority**: High — this is the single largest source of unnecessary code in the editor.

---

## Finding 2: Image Handling Redundancy (Medium)

**Files**: 8 adapter files, 2 extension files, 2 UI components = 12 files for images

**Specific redundancies**:

| Issue | Details | Action |
|-------|---------|--------|
| Dual resize UI | `image_toolbar_plugin.ts` (click-triggered, 118 lines, imperative DOM) duplicates the context menu's Resize submenu (right-click, Svelte/shadcn) | **Delete `image_toolbar_plugin.ts`** — context menu covers all resize presets |
| Belt-and-suspenders width sync | `image_width_plugin.ts` (31 lines) reconciles `width` attr→DOM, but the NodeView `update()` already does this | Investigate whether the NodeView edge case is real; if not, delete |
| Spec mutation hack | `image_context_menu_extension.ts` mutates `plugin.spec.view` after construction to bridge ProseMirror state to Svelte | Merge into the plugin's `view()` hook directly |

**What Obsidian does instead**: Single resize mechanism (drag handle storing `|WxH` suffix). No separate `image-block` node type — inline images are rendered as blocks by the renderer, not promoted by a plugin. Image paste is synchronous (auto-name + file write), no dialog. Image path autocomplete shares the `[[` wikilink suggest — no separate plugin.

**Obsidian's advantage here is syntactic**: `![[image.png]]` unifies images with note references under one suggest/autocomplete system. Carbide's standard Markdown `![alt](path)` requires separate handling. This is a **valid design choice**, not an error — but it does mean more moving parts.

**Recommendation**: Delete `image_toolbar_plugin.ts` (immediate, zero risk). Investigate `image_width_plugin.ts` for the NodeView edge case.

---

## Finding 3: Thin Extension Wrappers (Low-Medium)

**Pattern**: ~10 extension files are pure pass-through wrappers that do nothing but call 1-3 adapter factories and return `{ plugins }`.

Example — `block_drag_handle_extension.ts`:
```ts
export function create_block_drag_handle_extension(): EditorExtension {
  const plugins: Plugin[] = [create_block_drag_handle_prose_plugin()];
  return { plugins };
}
```

**Extensions that are justified** (conditional logic, context threading, lifecycle management):
- `wiki_link_extension.ts` — gates plugins on feature flags, manages `on_note_path_change`
- `suggest_extension.ts` — conditionally creates 4-5 plugins based on event handlers
- `lsp_extension.ts` — gates 5 plugins on 5 different event handlers
- `embed_extension.ts` — threads `PluginContext` callbacks
- `toolbar_extension.ts` — manages Svelte component lifecycle
- `image_extension.ts` — conditional paste plugin, inline NodeView

**Extensions that add no value** (zero conditionals, no state, no lifecycle):
- `block_drag_handle_extension.ts` (8 lines)
- `callout_extension.ts` (12 lines)
- `details_extension.ts` (13 lines)
- `code_block_extension.ts` (15 lines)
- `marks_extension.ts` (~15 lines)
- `math_extension.ts` (~15 lines)
- `ai_inline_extension.ts` (13 lines)
- `find_extension.ts` (~15 lines)
- `task_list_extension.ts` (~15 lines)

**Recommendation**: Either inline these into `assemble_extensions()` directly, or accept the cost as a documentation/naming convention. The cost is modest (~100 lines, 9 files) but sets a precedent that every feature needs a wrapper. **The inconsistency is worse than either approach** — two plugins are already inlined directly in `assemble_extensions()`:
```ts
{ plugins: [create_block_selection_plugin()] },
{ plugins: [create_diagnostics_decoration_plugin(ctx.get_markdown)] },
```

Pick one pattern and apply it consistently.

---

## Finding 4: LSP Integration — Justified but with Tooltip Duplication (Low)

**Files**: 8 LSP-related files + `diagnostics_decoration_plugin.ts`

**Assessment**: Obsidian has **nothing comparable**. No LSP client, no hover, no go-to-definition, no inlay hints, no diagnostics. This is qualitatively more sophisticated. The `iwes` AI backend and multi-provider design justify the full LSP surface — the protocol is the right integration mechanism for AI-powered semantic operations over the vault.

**Concrete issues**:

1. **Tooltip DOM duplication**: `lsp_hover_plugin.ts` and `diagnostics_decoration_plugin.ts` both build nearly identical tooltip DOM (fixed position, same inline styles, same `@floating-ui/dom` config, same hover-to-keep-open logic). Extract a shared `create_lsp_tooltip()` helper (~60-80 lines saved).

2. **Module-level mutable state bug**: `diagnostics_decoration_plugin.ts` line 62 has `let diagnostics_get_markdown: (() => string) | null = null` at module scope. If two editor instances mount simultaneously, the second overwrites the first. Every other LSP plugin correctly captures `get_markdown` in closures. Fix this.

3. **Dual fetch paths in code actions**: `lsp_code_action_plugin.ts` has `fetch_and_show` and `fetch_and_show_lsp` with near-identical range computation and dispatch flow. Unify.

**Recommendation**: Extract tooltip helper, fix the module-level state bug, unify code action fetchers.

---

## Finding 5: Markdown Pipeline — Well-Structured, Minor Issues (Low)

**Pipeline**: MD → `normalize_markdown_line_breaks()` → remark parse + plugins → MDAST → `mdast_to_pm()` → ProseMirror ↔ `pm_to_mdast()` → remark-stringify → MD

**Assessment**: The custom MDAST bridge is necessary given the remark plugin ecosystem being used. The callout, details, and highlight remark plugins operate cleanly at the MDAST level and would be harder as direct ProseMirror tokenizer rules. The converters are mechanical 1:1 mappings.

**What Obsidian does instead**: Obsidian treats MD as the document format throughout — CodeMirror 6 stores the raw text, and rich rendering happens via decorations layered on top. No roundtrip, no serialize/parse cycle, zero fidelity risk. Carbide's ProseMirror approach gets a proper document model with schema validation and natural Yjs collaboration at the cost of the roundtrip.

**Concrete issues**:
1. **`remark_details.ts` inner parse bug**: `parse_markdown_body()` creates a fresh `unified` instance without GFM/math/callout/highlight plugins. Content inside `<details>` blocks won't parse tables, nested callouts, or highlight syntax.
2. **Dead branching**: `remark_details.ts` lines 174-180 — `if (depth === 1) { collected.push(current) } else { collected.push(current) }` — identical bodies.
3. **Duplicate image cases**: `pm_to_mdast.ts` has near-identical `image-block` and `image` handlers — could merge.
4. **Type safety gap**: `AnyMdastNode = Record<string, unknown> & { type: string }` loses type safety across all conversions.

---

## Finding 6: Block Handling — Minor Duplication, Reasonable Split (Low)

**Pattern**: Each block type (callout, details, code block, embed) has a view plugin + keymap plugin (sometimes co-located, sometimes separate).

**Concrete issues**:
1. **`resize_icon` helper duplicated** between `details_view_plugin.ts` and `code_block_view_plugin.ts` — move to shared utility.
2. **`move_to_callout_body` / `move_to_details_content` are near-identical** — extract `move_cursor_to_section_body(view, $pos, container_type, open_attr?)`.
3. **`block_transforms.ts` expresses each target type's conversion twice** — once in `create_turn_into_command` (single block, using `wrapIn`/`setBlockType`) and once in `batch_turn_into` (multi-block, imperative). Either path could delegate to the other.
4. **Callout icons inconsistency**: `callout_view_plugin.ts` has a 40-line inline SVG map while all other view plugins use `lucide-static`.

---

## Finding 7: `prosemirror_adapter.ts` — Monolithic Session Factory (Observation)

The `prosemirror_adapter.ts` file is **1,140 lines** containing the entire `EditorPort` implementation as a single closure with ~35 methods. It handles:
- Session creation and destruction
- Buffer management (multi-tab)
- Yjs integration
- Markdown change tracking and dirty state
- Cursor/selection tracking
- Find/replace
- Block operations (turn-into, duplicate, delete)
- Heading fold management
- All 6 suggest channel wrappers

This is not necessarily wrong — it's the integration point where all plugins meet the session API. But the 6 near-identical suggest wrappers (`set_wiki_suggestions`, `set_heading_suggestions`, `set_image_suggestions`, `set_tag_suggestions`, `set_cite_suggestions`, `set_at_palette_suggestions`) are symptoms of the suggest duplication in Finding 1.

---

## Architectural Comparison: Carbide vs Obsidian

| Dimension | Carbide | Obsidian |
|-----------|---------|----------|
| **Per-feature file count** | |
| Autocomplete/suggest | 7+ files | 1 (extend `EditorSuggest`) |
| Image paste + resize + context menu | 7 files | 1-2 files |
| Callouts | 4 files + schema + remark plugin | 1 (CM6 `StateField` + CSS) |
| Markdown conversion layer | 6 files (pipeline, converters, remark plugins) | 0 (not needed — MD is the document) |
| **Architecture** | |
| Editor engine | ProseMirror (structured node tree) | CodeMirror 6 (flat text buffer) |
| Source of truth | PM node tree; serialize to MD at save | Markdown text always; decorations overlay |
| Roundtrip risk | Real — serialize/parse can mutate content | None — MD is never re-parsed |
| Rich editing model | Full (schema-validated, typed nodes, block commands) | Limited (decorations over text) |
| Collaborative editing | Natural (y-prosemirror) | Harder |
| Custom blocks | Schema nodes with full PM editing | CM widgets with manual cursor handling |
| Suggest/autocomplete | 4 separate plugins (~1,744 lines total) | `EditorSuggest<T>` abstract class (~40 lines per plugin) |
| Image handling | 8+ adapter files, dual resize UI | Wikilink unifies images/notes, drag-handle resize |
| LSP integration | Full LSP client (hover, completion, go-to-def, inlay hints, code actions, diagnostics) | None |
| Editor file count | ~100 files | Closed source; API surface is ~7,200 lines in `obsidian.d.ts` |

**Key insight**: Most of Obsidian's "simplicity" comes from CodeMirror 6's fundamental design — the markdown text IS the document, so there's no conversion pipeline, no serialize/parse roundtrip, and block rendering is decoration-based rather than node-based. Carbide's ProseMirror choice enables richer structured editing and better Yjs integration, but it inherently requires more machinery. **The question isn't whether to switch engines — it's whether Carbide has unnecessary machinery on top of the necessary machinery.**

### How Obsidian's Live Preview Actually Works (No Roundtrip)

Obsidian's Live Preview is the starkest contrast. There is **no conversion**:

1. Lezer (`@lezer/markdown` + Obsidian extensions) incrementally parses the CM6 text buffer.
2. CM6 `StateField`s and `ViewPlugin`s walk the syntax tree via `syntaxTree(state).iterate({...})`.
3. They return `DecorationSet`s that hide markdown tokens (the `*` around `*bold*`), replace them with styled widgets, or inject inline images.
4. When the cursor enters a decorated region, the decoration is removed so raw text becomes visible ("WYSIWYG cursor reveal", originally from HyperMD).

There is no `mdast_to_pm.ts`, no `pm_to_mdast.ts`, no remark plugins. The Lezer parser IS the parser. The CM6 decoration system IS the renderer. They are unified. Carbide's 6-file conversion layer (`markdown_pipeline.ts`, `mdast_to_pm.ts`, `pm_to_mdast.ts`, 3 remark plugins) is the inherent cost of ProseMirror — not something to eliminate, but important to understand as a permanent maintenance surface.

---

## Prioritized Recommendations

### High Impact

1. **Extract generic suggest factory** — Collapse 4 suggest plugins (~1,744 lines) into one generic + four 20-40 line configs (~400 lines total). Est. savings: ~1,200 lines.

2. **Delete `image_toolbar_plugin.ts`** — Context menu resize fully covers this. 118 lines, zero risk.

3. **Fix `diagnostics_decoration_plugin.ts` module-level state bug** — Correctness issue if multiple editor instances mount.

### Medium Impact

4. **Extract `create_lsp_tooltip()` helper** — Deduplicate tooltip DOM construction between hover and diagnostics plugins. ~60-80 lines.

5. **Fix `remark_details.ts` inner parse** — Pass the full processor to `parse_markdown_body()` so nested callouts/tables/highlights work inside `<details>` blocks.

6. **Standardize extension wrapper policy** — Either inline all thin wrappers into `assemble_extensions()` or keep them all. The current inconsistency (9 wrappers + 2 inlined) is the worst option.

### Low Impact

7. **Extract shared `move_cursor_to_section_body` helper** for callout/details keymap plugins.

8. **Extract shared `resize_icon` utility** from details/code block view plugins.

9. **Unify `block_transforms.ts` single/batch paths** to avoid expressing each target type's conversion twice.

10. **Remove dead branching in `remark_details.ts`** lines 174-180.

11. **Merge `image-block` / `image` cases in `pm_to_mdast.ts`**.

---

## What NOT to Change

- **The ProseMirror choice itself** — it enables structured editing, schema validation, and Yjs collaboration that CodeMirror 6 cannot match.
- **The MDAST pipeline** — it's well-structured and necessary for the remark plugin ecosystem.
- **The LSP integration** — it's unusual for a note app but justified by the `iwes` AI backend.
- **The view/keymap plugin file split** — keeps files focused and small per the project's conventions.
- **The adapter/extension architecture concept** — sound for extensions with real conditional logic. Only the thin wrappers are questionable.
