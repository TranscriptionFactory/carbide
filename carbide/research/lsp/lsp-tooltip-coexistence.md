# LSP & Tooltip Coexistence — Investigation Findings

## Problem Statement

Our custom editor plugins (wikilink handling, link tooltips, tag completion) dominate over LSP-provided features. LSP tooltips never show because our implementations always win the race. Some LSP features (notably Markdown Oxide block references) are completely broken by our plugins intercepting their trigger patterns.

## Architecture

The editor uses ProseMirror plugins assembled in `assemble_extensions()` at `src/lib/features/editor/extensions/index.ts:29`. The relevant plugins are registered in this order:

1. `create_link_extension()` → includes `link_tooltip_plugin` (hover preview/edit for link marks)
2. `create_wiki_link_extension()` → includes `wiki_link_converter_plugin` (converts `[[...]]` to link marks) and `wiki_link_click_plugin`
3. `create_suggest_extension()` → includes `wiki_suggest_plugin` (completion for `[[`)
4. `create_lsp_extension()` → includes `lsp_hover_plugin`, `lsp_completion_plugin`, `lsp_definition_plugin`, etc.

## Clash 1: Hover Tooltips (Link Tooltip vs LSP Hover)

### Mechanism

Both `link_tooltip_plugin` (`src/lib/features/editor/adapters/link_tooltip_plugin.ts:215`) and `lsp_hover_plugin` (`src/lib/features/editor/adapters/lsp_hover_plugin.ts:19`) independently attach `mousemove`/`mouseleave` handlers to `editor_view.dom`. There is no coordination between them.

When hovering a link mark (including converted wikilinks):

- **link_tooltip_plugin** (50ms delay): detects the link mark via `find_link_at_event()`, shows preview popover with URL + edit/copy/remove buttons
- **lsp_hover_plugin** (350ms delay): sends `textDocument/hover` to the markdown LSP, tries to show its own tooltip

The link tooltip wins the visual race. The LSP tooltip either never appears, renders underneath, or gets suppressed.

### What the LSP provides on hover (currently invisible)

- **Markdown Oxide**: Note content previews (first lines of target note), backlink counts, resolved paths
- **Marksman**: Resolved file path, heading structure
- **IWE**: Document structure information

### Affected elements

- Wikilinks (converted to link marks with `link_source: "wiki"`)
- Standard markdown links `[text](url)`
- Any text with a link mark

### Key files

- `src/lib/features/editor/adapters/link_tooltip_plugin.ts` — `create_link_tooltip_prose_plugin()`, `find_link_at_event()`
- `src/lib/features/editor/adapters/lsp_hover_plugin.ts` — `create_lsp_hover_plugin()`
- `src/lib/features/editor/extensions/link_extension.ts` — registers link tooltip
- `src/lib/features/editor/extensions/lsp_extension.ts` — registers LSP hover (guarded by `ctx.events.on_markdown_lsp_hover`)

## Clash 2: Completion (Wiki Suggest vs LSP Completion)

### Mechanism

The `lsp_completion_plugin` (`src/lib/features/editor/adapters/lsp_completion_plugin.ts:86`) has an explicit guard:

```ts
if (wiki_suggest_plugin_key.getState(view.state)?.active) return null;
```

Whenever our wiki suggest plugin is active, **all LSP completion is suppressed**. The wiki suggest activates on `[[` via `extract_wiki_query()` (`src/lib/features/editor/adapters/wiki_suggest_plugin.ts:75`).

### Block references are completely broken

`extract_wiki_query()` parses `[[note#^block-id` as:
```ts
{ mode: "heading", heading_query: "^block-id", note_name: "note" }
```

It treats `#^` as a heading query, which will never match any headings (they don't start with `^`). Meanwhile, Markdown Oxide's block reference completion — triggered by `^` — is blocked because wiki suggest is active.

Markdown Oxide registers `["[", "(", "#", "^"]` as completion trigger characters (confirmed in `src-tauri/src/features/markdown_lsp/provider.rs:292-298`). The `^` trigger is specifically for block linking within `[[note#^...]]`.

### Completion trigger characters by provider

| Provider | Trigger Characters |
|----------|-------------------|
| Markdown Oxide | `[`, `(`, `#`, `^` |
| IWE | `+`, `[`, `(` |
| Marksman | `[`, `(`, `#` |

### Key files

- `src/lib/features/editor/adapters/wiki_suggest_plugin.ts` — `extract_wiki_query()`, `create_wiki_suggest_prose_plugin()`
- `src/lib/features/editor/adapters/lsp_completion_plugin.ts` — `trigger_context()` with the wiki suggest guard
- `src-tauri/src/features/markdown_lsp/types.rs` — `completion_trigger_characters()` per provider
- `src-tauri/src/features/markdown_lsp/provider.rs` — provider-specific trigger chars

## Clash 3: Definition / Go-to-Definition

Not a direct clash currently — `lsp_definition_plugin` uses Cmd+Click which doesn't conflict with the link tooltip's regular click handler or the wiki link click handler. However, they operate on the same link marks, and the wiki link click plugin (`wiki_link_plugin.ts:303`) handles plain clicks on links, preventing the default browser navigation. Cmd+Click goes to LSP definition, plain click goes to our wiki link handler. This split works.

## Full Conflict Map

| Element | Our Plugin | LSP Feature | Who Wins | LSP Value Lost |
|---------|-----------|-------------|----------|----------------|
| Hover on wikilink | link_tooltip (preview/edit/remove) | hover (note content preview) | **Ours** | High |
| Hover on markdown link | link_tooltip (preview/edit/remove) | hover (target info) | **Ours** | Medium |
| Hover on plain text | (none) | hover (diagnostics, word info) | **LSP** | Works correctly |
| `[[` completion | wiki_suggest (note mode) | completion | **Ours**, LSP blocked | Low (ours is good) |
| `[[note#` completion | wiki_suggest (heading mode) | completion | **Ours**, LSP blocked | Low (ours works) |
| `[[note#^` block ref | wiki_suggest (heading mode, BROKEN) | completion (block IDs) | **Both broken** | Critical |
| `#tag` completion | tag_suggest_plugin | N/A | Ours only | N/A |
| Click on link | wiki_link_click_plugin | N/A | Ours | N/A |
| Cmd+Click definition | (none) | lsp_definition_plugin | **LSP** | Works correctly |
| Code actions | (none) | lsp_code_action_plugin | **LSP** | Works correctly |
| Inlay hints | (none) | lsp_inlay_hints_plugin | **LSP** | Works correctly |

## Design Options for Tooltip Coexistence

### Option A: Merged Tooltip

When hovering a link mark, show a single unified popover containing both:
- LSP hover content at the top (note preview from Markdown Oxide)
- Link action buttons at the bottom (edit, copy, remove)

**Pros**: Single tooltip, no visual clutter, best UX
**Cons**: Requires coordinating async LSP response with sync link detection, more complex plugin

### Option B: Priority with Coordination

Link tooltip checks `lsp_hover_plugin_key` state. LSP hover checks `link_tooltip_plugin_key` state. Only one shows at a time based on priority rules.

**Pros**: Simple to implement
**Cons**: Still loses one tooltip's info

### Option C: Modifier-Key Split (VS Code style)

- Regular hover → link tooltip (edit/copy/remove)
- Alt+hover or Cmd+hover → LSP hover (note preview, diagnostics)

**Pros**: No visual conflict, familiar pattern
**Cons**: Discoverability issue, users may never learn about Alt+hover

### Option D: LSP Hover for Non-Link, Merged for Link

- On non-link text: LSP hover shows normally (already works)
- On link marks: merged tooltip (Option A)
- Block references: fix `extract_wiki_query` to not catch `#^`, let LSP handle it

**Pros**: Combines best of both, minimal regression
**Cons**: Most implementation work

## Recommended Approach

**Option D** — with these specific changes:

1. **Fix block references immediately**: In `extract_wiki_query()`, detect `#^` pattern and return `null` so it falls through to LSP completion
2. **Merge link tooltip with LSP hover**: When hovering a link mark, fire both the link detection AND the LSP hover request. Render a combined popover with LSP content (if any) above the action buttons
3. **Keep non-link hover as-is**: LSP hover already works for plain text since link_tooltip doesn't activate

## Rust-Side Context

The LSP hover handler is at `src-tauri/src/features/markdown_lsp/service.rs:462`. It sends a standard `textDocument/hover` request and extracts `contents.value` from the response. The result type is simple:

```typescript
type MarkdownLspHoverResult = { contents: string | null };
```

The Rust side needs no changes — the coordination is purely in the TypeScript editor plugins.

## Settings Context

- `markdown_lsp_enabled` (bool) — master toggle for the markdown LSP
- `markdown_lsp_provider` — `"iwes"` | `"markdown_oxide"` | `"marksman"`
- Feature capabilities are negotiated per-provider via `MarkdownLspServerCapabilities` (hover, completion, references, etc.)

Settings are defined in `src/lib/features/settings/domain/settings_catalog.ts:686-726`.
