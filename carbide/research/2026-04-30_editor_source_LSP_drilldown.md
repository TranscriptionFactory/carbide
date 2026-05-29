# Editor Coordination Fixes

## Context

Three editor coordination issues on `feat/extensible-lsp-suggest-coordination`:
1. Wiki suggest locks user out after accepting a note — no way to drill into `#heading` or `#^block`
2. Source mode (CodeMirror) has zero LSP support — no hover, no completion
3. LSP hover and link tooltip show duplicate tooltips on wiki links

---

## Issue 1: Wiki suggest sub-reference drill-down

**Files to modify:**
- `src/lib/features/editor/adapters/suggest_plugin_factory.ts` — allow `accept()` to signal "keep suggest active"
- `src/lib/features/editor/adapters/wiki_suggest_plugin.ts` — implement drill-down in `accept()`
- `src/lib/features/editor/adapters/wiki_link_plugin.ts` — skip conversion when wiki suggest is active

### Plan

**Step 1: Extend `SuggestConfig.accept` return type** (`suggest_plugin_factory.ts`)

Change `accept` signature from `(view, item, state) => void` to `(view, item, state) => boolean | void`. If it returns `true` ("keep active"), the factory's `accept()` wrapper skips:
- `suppress_next_activation = true`
- `config.on_dismiss()`
- `hide_dropdown()`
- `config.on_accepted?.()`

This lets the wiki suggest plugin signal drill-down without the factory tearing down the suggest UI.

**Step 2: Modify `accept()` in wiki suggest** (`wiki_suggest_plugin.ts`)

When `item.kind` is `"existing"` or `"planned"` (a note, not a heading/block):
- Write `replacement = prefix + "[[" + inner + "#"` (no closing `]]`)
- Keep `replace_to = selection_from + 2` — this eats the auto-closed `]]` from paired_delimiter, leaving `[[note#|` with cursor after `#`
- Set meta: `{ active: true, query: inner + "#", from: state.from, items: [], selected_index: 0 }`
- Update module state: `current_mode = "heading"`, `current_note_name = format_wiki_display(item.path)`
- Return `true` to tell factory "keep suggest alive"

When `item.kind` is `"heading"` or `"block"` — unchanged (close the link, return void).

**Why this is clean:** No new abstractions. The factory gets a 1-line contract extension (check accept return). The wiki suggest plugin's accept gains a branch for notes vs sub-refs. `extract_wiki_query` already parses `[[note#` into heading mode, so the next `update()` cycle naturally transitions to heading suggestions. Total diff: ~20 lines across 3 files.

**Step 3: Guard wiki_link_plugin conversion** (`wiki_link_plugin.ts`)

In `appendTransaction`, before the regex scan, check `wiki_suggest_plugin_key.getState(new_state)?.active`. If active, skip conversion. Import `wiki_suggest_plugin_key` from `wiki_suggest_plugin.ts`.

### Verify
- `[[` → select note → `[[note#` → heading dropdown → select heading → `[[note#heading]]` converted to mark
- `[[` → select note → Escape → `[[note#` remains (user edits manually)
- Existing heading/block accept paths still work unchanged
- `pnpm check && pnpm test`

---

## Issue 2: LSP hover and completion in source mode — DONE (d68f5382)

**Files to modify:**
- `src/lib/features/editor/application/editor_service.ts` — expose public methods for LSP hover/completion
- `src/lib/features/editor/adapters/cm_lsp_hover.ts` *(new)* — CodeMirror hover extension
- `src/lib/features/editor/adapters/cm_lsp_completion.ts` *(new)* — CodeMirror completion extension
- `src/lib/features/editor/ui/source_editor_content.svelte` — wire CM LSP extensions

### Plan

**Step 1: Expose LSP methods on EditorService** (`editor_service.ts`)

Add public methods that wrap the private callbacks with note-path injection:

```ts
async lsp_hover(line: number, character: number): Promise<{ contents: string | null } | null> {
  const note = this.active_note;
  if (!note || is_draft_note_path(note.meta.path)) return null;
  return this.callbacks.on_markdown_lsp_hover?.(note.meta.path, line, character) ?? null;
}

async lsp_completion(line: number, character: number): Promise<LspCompletionResult | null> {
  const note = this.active_note;
  if (!note || is_draft_note_path(note.meta.path)) return null;
  return this.callbacks.on_markdown_lsp_completion?.(note.meta.path, line, character) ?? null;
}

get lsp_completion_trigger_characters(): string[] {
  return this.callbacks.get_markdown_lsp_completion_trigger_characters?.() ?? [];
}
```

**Step 2: Create CM hover extension** (`cm_lsp_hover.ts`)

A `ViewPlugin` that:
- Listens to `mousemove` on the CM editor's DOM
- Debounces 350ms (same as PM hover)
- Maps CM position → `{ line, character }` using `line_character_from_md_offset()` (reuse from `lsp_plugin_utils.ts`)
- Calls `editor_service.lsp_hover(line, character)`
- Uses generation counter to discard stale results
- Shows a floating tooltip (same DOM structure as PM LSP hover, reuse `render_lsp_markdown` from `lsp_tooltip_renderer.ts`)
- Factory: `create_cm_lsp_hover(editor_service: EditorService): Extension`

**Step 3: Create CM completion extension** (`cm_lsp_completion.ts`)

Use CM6's `@codemirror/autocomplete` API:
- Register a `CompletionSource` that calls `editor_service.lsp_completion(line, character)`
- Map LSP completion items to CM `Completion` objects
- Use `editor_service.lsp_completion_trigger_characters` for activation
- Factory: `create_cm_lsp_completion(editor_service: EditorService): Extension`

**Step 4: Wire into source_editor_content.svelte**

In `onMount`, after building extensions array:
- Get `editor_service` from `use_app_context().services.editor`
- Dynamically import `cm_lsp_hover` and `cm_lsp_completion`
- Push extensions if callbacks exist (check `editor_service.lsp_hover` is available)

### Verify
- Open a note in source mode → hover over a symbol → LSP tooltip appears
- Type a trigger character → completion dropdown appears with LSP suggestions
- `pnpm check && pnpm test`

---

## Issue 3: Dual LSP hover tooltips on wiki links — DONE (7a91bede)

**File to modify:**
- `src/lib/features/editor/adapters/lsp_hover_plugin.ts` — check for link mark before starting hover timeout

### Plan

In `on_mousemove`, after resolving `pos` from coords, check whether the position has a link mark. If it does and `native_link_hover_enabled` is true, skip the hover entirely (clear timeout, don't start a new one).

**Implementation:**

Add `native_link_hover_enabled` to the plugin's input params (it's already threaded through `lsp_extension.ts`).

In `on_mousemove`, after `const pos = pos_result.pos`:

```ts
if (input.native_link_hover_enabled) {
  const resolved = editor_view.state.doc.resolve(pos);
  const marks = resolved.marks();
  if (marks.some(m => m.type.name === "link")) {
    if (hover_timeout) clearTimeout(hover_timeout);
    if (!hovering_tooltip) hide();
    return;
  }
}
```

This is a synchronous, pre-timeout check. No race condition — if the cursor is over a link, LSP hover never fires. The link tooltip plugin handles all hover display for links (including an embedded LSP section).

Also remove the `should_suppress_visual` mechanism since it becomes unnecessary — but keep it for now as a safety net (it still handles edge cases like programmatic `trigger_lsp_hover` calls).

### Verify
- Hover a wiki link without editor focus → only link tooltip shows (no LSP tooltip)
- Hover a wiki link with focus → only link tooltip shows (with LSP section inside)
- Hover non-link text → LSP hover works normally
- Hover text with diagnostic → diagnostic takes precedence (existing behavior)
- `pnpm check && pnpm test`

---

## Execution order

1. ~~Issue 3 (smallest, self-contained) → commit~~ DONE `7a91bede`
2. Issue 1 (medium, touches suggest framework) → commit — NOT STARTED (skipped per user request)
3. ~~Issue 2 (largest, new files) → commit~~ DONE `d68f5382`

## Post-edit

- `pnpm check && pnpm lint && pnpm test && cd src-tauri && cargo check`
- `pnpm format`

## Implementation notes

**Issue 3 (7a91bede):** Added `native_link_hover_enabled` input param to `create_lsp_hover_plugin`. In `on_mousemove`, resolves ProseMirror position and checks for `link` mark before starting hover timeout — if found, hides any existing tooltip and returns. Wired via `lsp_extension.ts`. Kept `should_suppress_visual` as safety net for programmatic `trigger_lsp_hover` calls.

**Issue 2 (d68f5382, 6ec0c64c):** Added `lsp_hover()`, `lsp_completion()`, `lsp_completion_trigger_characters`, `callbacks_have_lsp_hover`, `callbacks_have_lsp_completion` to `EditorService`. Created `cm_lsp_hover.ts` (ViewPlugin, debounced mousemove, `@floating-ui/dom` tooltip, `render_lsp_markdown`) and `cm_lsp_completion.ts` (`@codemirror/autocomplete` CompletionSource wrapping EditorService). Wired into `source_editor_content.svelte` via conditional dynamic imports. Added `@codemirror/autocomplete` as direct dependency.
