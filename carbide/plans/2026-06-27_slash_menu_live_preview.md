# Slash menu live preview pane

**Status:** proposed
**Scope:** editor-only, additive UI enhancement
**Origin:** ported pattern from OpenKnowledge (`packages/app/src/editor/slash-command/SlashCommandMenu.tsx` + `items.tsx`), where each slash item ships a `preview.render()` that draws a real, styled mini-example of the block it inserts, shown in a pane beside the item list.

## Why

Carbide's slash menu already exists and works (`src/lib/features/editor/adapters/slash_command_plugin.ts`). Items currently render as `icon + label + description`. OpenKnowledge's one clear editor-UX edge here is a **side preview pane** that renders what the selected command will actually produce (a styled H1, a checkbox list, a 2×2 table, a callout). It removes the "what does this insert?" guess and reads as markedly more polished. This is a refinement of existing code, not a new feature.

## Current state (what we extend)

- **Plugin:** `slash_command_plugin.ts` — a vanilla-DOM ProseMirror plugin. The menu is a `<div class="SlashMenu">` built imperatively in `render_items()`; items are `<button class="SlashMenu__item">` with `.SlashMenu__icon`, `.SlashMenu__text > .SlashMenu__label / .SlashMenu__desc`, optional `.SlashMenu__badge`.
- **Item type:** `SlashCommand { id, label, description, icon, keywords, insert, is_available?, source?, plugin_name? }`. Built-ins from `create_commands()`; plugin commands merged in via `config.get_plugin_commands()`.
- **Mount/position/dismiss:** `suggest_dropdown_utils.ts` (`mount_dropdown`, `position_suggest_dropdown`, `create_cursor_anchor`, `attach_outside_dismiss`, `scroll_selected_into_view`).
- **Selection:** `slash_state.selected_index`, updated in `update()` and the `ArrowUp/Down` handlers; both call `render_items()`.
- **Styles:** `.SlashMenu*` classes (locate in `src/styles/` — same file as other editor dropdown chrome).

**Constraint:** the menu is pure DOM (no Svelte component). The preview must be pure DOM too, to stay surgical and avoid mounting a Svelte island inside a ProseMirror plugin view. We render preview markup that reuses the editor's own CSS so previews match real output and track the active theme.

## Architecture fit

Per `docs/architecture.md` decision tree this is **visual-only**, living inside an existing **editor adapter** (ProseMirror plugin). No new ports/stores/services/actions/reactors. Adapters may hold DOM logic (this one already does). Cross-feature rule unaffected.

## Design

### 1. Extend the item type
Add one optional field to `SlashCommand`:

```ts
preview?: () => HTMLElement; // built lazily, cached by command id
```

Plugin-contributed commands omit it (they get the fallback card, see §4).

### 2. Two-pane menu layout
Restructure the menu container to hold a list pane and a preview pane:

```
.SlashMenu              (flex row)
├─ .SlashMenu__list     (existing items; the listbox)
└─ .SlashMenu__preview  (new; aria-hidden, decorative)
   └─ .SlashMenu__preview-frame  (aspect-framed box)
      └─ .ProseMirror               ← reuse editor.css so the preview renders
         └─ <preview markup>           identically to real inserted content
```

- Move the existing item loop into `.SlashMenu__list`.
- Render the preview for `state.filtered[state.selected_index]` into `.SlashMenu__preview` whenever the selection changes (i.e. inside `render_items()` and the arrow handlers, which already re-render).
- Wrapping preview markup in a `.ProseMirror` container makes headings/lists/callouts/code/tables inherit `src/styles/editor.css` verbatim — themed, zero duplicated styling.

### 3. Preview builders
Add a `preview` to each built-in in `create_commands()`. Build the same node shapes the `insert` fns produce, as detached DOM (no editor view), e.g.:

- Headings h1–h6 → `<div class="cb-h{n}">Heading</div>` styled by the editor heading rules (or a `<h1>`… inside `.ProseMirror`).
- Bullet / ordered / task list → a 2–3 item `<ul>/<ol>`; task list reuses `li[data-item-type="task"]` so the existing custom checkbox CSS renders.
- Table → 2×2 with a header row (`Col 1 / Col 2`).
- Callouts → `.callout-block.callout-block--{type}` with title + one body line (reuses the existing callout system — note/warning/tip/important/example).
- Code block → `<pre><code>` with two placeholder lines.
- Math → a small static KaTeX-rendered sample, or a plain `∑` glyph card if rendering KaTeX detached is awkward (keep it cheap).
- Blockquote, divider, collapsible → direct DOM equivalents.
- Smart blocks (query / base / backlinks / task-query) and `frontmatter` → a representative **static placeholder** card (a labeled mini-mock), since live data isn't available in a preview.

Cache: build once per command id and reuse the node (clone or detach/reattach) to avoid rebuilding on every keystroke.

### 4. Fallbacks (graceful, never blank)
- Command without `preview` (all plugin commands, any built-in not yet covered) → render a fallback card: large icon + label + description. The pane is never empty while an item is selected.
- `filtered.length === 0` → hide the whole menu (existing behavior).
- Preview builder throws → swallow and show the fallback card (never break the menu).

### 5. Positioning
The menu is now wider. Update `position_suggest_dropdown` usage so the combined width is measured after `render_items()` (it already positions post-render). Verify flip/fit near the right viewport edge; the preview pane is fixed-width (~16rem) so total width is deterministic. Add a max-height + `.scroll-fade-mask` on `.SlashMenu__list` for long lists (the new `src/styles/motion.css` utility).

### 6. A11y
- `.SlashMenu__list` keeps the listbox semantics and `selected_index` focus model.
- `.SlashMenu__preview` is `aria-hidden="true"` (decorative; the description already conveys meaning to AT).
- Respect reduced motion: any marker/preview transition uses `--ease-out-strong` and is neutralized by the global `prefers-reduced-motion` guard now in `motion.css`.

## Files touched

- `src/lib/features/editor/adapters/slash_command_plugin.ts` — `SlashCommand.preview?`, `create_commands()` builders, `render_items()` two-pane split + preview render, a `build_preview(cmd)` helper with caching + fallback.
- `src/styles/` (the `.SlashMenu*` block) — `.SlashMenu` flex row, `.SlashMenu__list`, `.SlashMenu__preview`, `.SlashMenu__preview-frame`, fallback-card styles.
- (optional) extract preview builders into `slash_command_previews.ts` beside the plugin if `create_commands()` grows unwieldy.

## Testing (BDD)

Add `tests/unit/adapters/slash_command_previews.test.ts` (or extend existing slash tests):

- **Scenario: every built-in has a preview.** `create_commands()` → assert each non-plugin command yields a non-null `preview()` that returns an `HTMLElement`.
- **Scenario: preview shape matches command.** For a sample (h1, todo, table, callout-note, code), assert the produced DOM contains the expected marker (`.callout-block--note`, `li[data-item-type="task"]`, a 2×2 `table`, etc.).
- **Scenario: builder is resilient.** A command whose builder throws falls back to the icon/label card (mock + assert no throw, fallback present).
- **Scenario: plugin command has no preview → fallback.** A `source:"plugin"` command renders the fallback card.

Keep tests deterministic DOM assertions (jsdom); no editor view needed since builders are detached.

## Risks / notes

- **Perf:** rebuilding preview DOM on every keystroke is wasteful — cache by command id (selection changes far less than the filter does).
- **KaTeX in preview:** rendering math detached may pull in KaTeX eagerly; prefer the cheap glyph card unless KaTeX is already loaded in the editor session.
- **Width on small windows:** ensure the menu still fits; consider hiding the preview pane below a min editor width.
- **Out of scope:** the `@` palette (`at_palette_plugin.ts`) — it inserts references, not blocks, so previews don't apply.

## Validation

`pnpm check`, `pnpm lint`, `pnpm test`, `pnpm format` (CSS is JS-adjacent here; the layering lint won't flag adapter DOM code).
