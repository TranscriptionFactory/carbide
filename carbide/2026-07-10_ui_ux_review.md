# UI/UX Review — Scroll, Polish, and Residual Gaps

**Date:** 2026-07-10
**Status:** Analysis complete
**Scope:** Review pass across Carbide's UI/UX, benchmarked against tolaria and open-knowledge. Focus on scroll-fighting, scroll-jumping, HTML preview issues, and adoptable polish patterns. Notes potential bugs along the way.
**Sources:** `~/src/tolaria` (Tauri + React + BlockNote), `~/src/open-knowledge` (Bun + React + TipTap), `~/src/carbide` (Tauri + Svelte 5 + ProseMirror)

---

## 1. Executive summary

The 2026-07-02 UI polish adoption plan has landed most of its phases. The headline finding from this review is a **distinct bug class that the 2026-07-02 plan did not address: scroll-fighting.** Multiple ProseMirror NodeView children declare their own nested `overflow: auto` + `max-height`, creating scrollers that compete with the page scroller for the wheel. One mermaid wheel handler unconditionally hijacks the wheel. There is no `overscroll-behavior` anywhere in the editor stylesheet, so scroll chaining at boundaries is left to default browser behavior — the source of the "fights the mouse scrolling" feel.

The tab-switch / dialog scroll-jump bug (BUG_REPORT #4) was attempted in `ab2ef491` but the **root cause is not fixed**: `get_scroll_top`/`set_scroll_top` still reference the wrong DOM element in non-split visual mode. The HTML preview (BUG_REPORT #2) shipped via `carbide-html://` protocol but has a dual-CSP divergence that silently breaks previews, and an auto-preview gating gap versus open-knowledge. The `each_key_duplicate` error (BUG_REPORT #3) has a component-level guard still missing.

### Status of the 2026-07-02 plan

| Phase | Status | Notes |
| --- | --- | --- |
| P1 warm-neutral palette + zinc→token sweep | ✅ Done | |
| P2 Tauri overlay titlebar + traffic lights | ✅ Done | `tauri.conf.json:100-102` |
| P2 native vibrancy for glass themes | ❌ Not done | `window-vibrancy` in `Cargo.lock` but unused in `src-tauri/src`; CSS glass themes float on opaque windows |
| P3 motion (agent-flash, easing, a11y guards) | ✅ Done | `motion.css`, `design_tokens.css:255` |
| P4 editor typography-as-data | ✅ Done | |
| P5 two-pane slash live preview | ⚠️ Partial | `slash_command_previews` exist; no two-pane `listbox` + `aside` structure |
| P6 platform-aware titlebar | ⚠️ Partial | macOS fine (native lights + padding); **no Linux/Win window controls** (min/max/restore/close, resize handles, maximized observer) |
| P7 prune theme catalog | ❌ Not done | ~25 theme CSS files remain |
| P8 #2 global affordance rule | ⚠️ Partial | 1 rule in `component_overrides.css:110`; `editor.css` still has **46 scattered** `cursor: pointer` declarations |
| P8 #3 child-window chrome | Unknown | Needs verification |
| P8 #4 accent-tracked selection-soft | ✅ Done | `design_tokens.css:75,310` |
| P8 #5 reserved AI-state accent | ✅ Done | |
| Omnibar sort/filter (BUG_REPORT #1) | ✅ Done | `e71bc679` |
| HTML preview protocol (BUG_REPORT #2) | ✅ Done | `79e0e841` — CSP divergence + gating remain (§4) |
| Tab scroll restore (BUG_REPORT #4) | ⚠️ Attempted | `ab2ef491` — root cause unfixed (§3) |

---

## 2. P0 — Scroll-fighting root causes

The editor has **one intended page scroller** — `.NoteEditor` (`overflow-y: auto`, `src/lib/features/note/ui/note_editor.svelte:215`) — but multiple NodeView children declare their own `overflow: auto` + `max-height`, creating nested scrollers that compete for the wheel. There is **no `overscroll-behavior`** anywhere in `src/styles/editor.css` (confirmed: zero matches), so scroll chaining is left to default browser behavior, which on trackpads/momentum scroll feels like "fighting."

### 2.1 Mermaid wheel handler unconditionally hijacks scroll (most explicit)

**`src/lib/features/editor/adapters/code_block_view_plugin.ts:782-791`**
```js
container.addEventListener("wheel", (e) => {
  if (!this.mermaid) return;
  e.preventDefault();          // unconditional
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  this.mermaid_zoom(delta);
}, { passive: false });
```
`setup_mermaid` defaults to `is_preview: true` (`code_block_view_plugin.ts:708`), so `this.mermaid` is non-null for **every** mermaid block on screen. While the cursor is over a mermaid diagram, **any** wheel event is swallowed and turned into a zoom — the user cannot scroll the page by wheel over a mermaid preview at all. This is the single most explicit "fights the mouse scrolling" instance.

**Fix direction:** Gate the hijack behind `e.ctrlKey || e.metaKey` (zoom only with modifier), or only hijack in fullscreen mode (`.mermaid-fullscreen`), or remove wheel-zoom and rely on the zoom in/out buttons.

### 2.2 Code block `<pre>` is a nested vertical scroller (highest breadth)

**`src/styles/editor.css:667-674`**
```css
.ProseMirror pre {
  overflow-x: auto;
  overflow-y: auto;
  max-height: var(--editor-code-block-max-height); /* 24rem, line 24 */
}
```
When the mouse is over a code block taller than 24rem (or a resized block via `apply_height`, `code_block_view_plugin.ts:283-291`, which sets a fixed `height` + `maxHeight = "none"`), vertical wheel scrolls the `<pre>` first; only after hitting the boundary does scroll chain to `.NoteEditor`. On trackpads the inner scroller steals momentum, and crossing the boundary causes a jump. This matches "depending on where the mouse is."

**Fix direction:** Drop `overflow-y: auto` + `max-height` from `.ProseMirror pre` (let the page scroller own vertical); keep only `overflow-x: auto` for long lines. If a capped height is wanted, apply it only when the user explicitly resizes (toggle a class on the wrapper) and add `overscroll-behavior: contain`.

### 2.3 Table wrapper is a nested vertical scroller at 80vh

**`src/styles/editor.css:1395-1397`**
```css
.ProseMirror .tableWrapper {
  overflow-x: auto;
  max-height: 80vh;
}
```
Per CSS spec, `overflow-x: auto` with `overflow-y` at its initial (`visible`) forces `overflow-y` to compute to `auto`. So the wrapper scrolls on **both** axes; with `max-height: 80vh` a tall table becomes an 80vh nested vertical scroller. There is no table NodeView (tables render via prosemirror-tables default + `.tableWrapper`). Hovering a tall table → wheel scrolls the tableWrapper up to 80vh before chaining to the page.

**Fix direction:** Remove `max-height: 80vh` (let tables grow; the page scroller handles vertical). Keep `overflow-x: auto` for wide tables — once `max-height` is gone, the computed `overflow-y: auto` no longer traps because content never overflows vertically. Add `overscroll-behavior-x: contain`.

### 2.4 Note-embed content is a nested 400px scroller

**`src/styles/editor.css:3465-3473`**
```css
.note-embed__content {
  max-height: 400px;
  overflow-y: auto;
}
```
NodeView: `src/lib/features/editor/adapters/note_embed_view_plugin.ts:180-183`. Hovering a transcluded note embed → wheel scrolls the 400px-capped content first, then chains.

**Fix direction:** Remove `max-height`/`overflow-y` (let embeds grow with the page), or make the cap opt-in via the existing collapse toggle (`note_embed_view_plugin.ts:142-152` already supports `collapsed`). Add `overscroll-behavior: contain` if a cap is kept.

### 2.5 PDF file-embed scroll wrapper

**`src/lib/features/editor/adapters/file_embed_view_plugin.ts:342-345`**
```js
scroll_wrapper.style.overflow = "auto";
scroll_wrapper.style.height = "100%";   // parent .file-embed-content has fixed px height
```
Hovering a PDF embed → wheel scrolls the fixed-height `overflow: auto` wrapper instead of the page. Same pattern, lower frequency.

**Fix direction:** `overflow-y: hidden` (let page scroll), or `overscroll-behavior: contain`, or don't cap the embed height.

### 2.6 No `overscroll-behavior` anywhere (cross-cutting)

No `overscroll-behavior` declarations exist in `src/styles/editor.css`. Nested scrollers (code `<pre>`, `.tableWrapper`, `.note-embed__content`) use default `auto`, producing the inconsistent "bounce"/"fight" feel at boundaries across browsers/trackpads.

**Fix direction:** Add `overscroll-behavior: contain` to surviving nested scrollers, and `overscroll-behavior-y: contain` on `.NoteEditor` to prevent scroll chaining past the editor into the app shell.

### NodeViews confirmed clean (no scroll-fighting)

- **`callout_view_plugin.ts`** — no overflow/wheel; `stopEvent` traps only menu/toggle/icon. CLEAN.
- **`details_view_plugin.ts`** — no overflow/wheel; `stopEvent` traps only the toggle button. CLEAN.
- **`frontmatter_view_plugin.ts`** — no overflow/wheel. CLEAN.
- **`math_plugin.ts`** — `stopEvent` returns `true` but no `preventDefault` on wheel; KaTeX render has no nested scroller. CLEAN.
- **`excalidraw_embed_view_plugin.ts`** — `.excalidraw-embed-preview` is `overflow: hidden`; no wheel handler. CLEAN.

---

## 3. P0 — Tab-switch / dialog scroll-jump (root cause unfixed)

### 3.1 `get_scroll_top`/`set_scroll_top` target the WRONG element in non-split visual mode

**`src/lib/features/editor/application/editor_service.ts:444-460`**
```js
get_scroll_top(): number {
  return this.host_root?.parentElement?.scrollTop ?? 0;   // line 445
}
set_scroll_top(value: number) {
  if (value < 0) return;
  let frames = 0;
  const apply = () => {
    const container = this.host_root?.parentElement;       // line 452
    if (!container) return;
    container.scrollTop = value;
    if (container.scrollTop < value && frames++ < 8) {
      requestAnimationFrame(apply);
    }
  };
  requestAnimationFrame(apply);
}
```
`host_root` is the `.NoteEditor__content` div. In non-split visual mode the DOM hierarchy is: `.NoteEditor` (`overflow-y: auto` — THE scroller) › `.NoteEditor__visual-wrapper` (no overflow) › `ContextMenu.Trigger` div (no overflow) › `.NoteEditor__content` (= `host_root`). So `host_root.parentElement` is the `ContextMenu.Trigger` div (or `.NoteEditor__visual-wrapper`) — **neither is a scroll container**. Its `scrollTop` is always 0, and setting `scrollTop` on it is a no-op.

The recent fix `ab2ef491` changed `<= 0` → `< 0` and wired the (always-0) value through `resolve_editor_sync_scroll_top`, but the value is still always 0 in visual mode because the scroller reference is wrong. Scroll restoration is effectively **disabled** in non-split visual mode.

**Split view is accidentally correct:** in split mode `host_root.parentElement` = `.NoteEditor__split-pane` (`overflow-y: auto`), so the bug is specific to non-split visual mode.

**Fix direction:** Resolve the real scroller by walking up from `host_root` to the first ancestor whose computed `overflow-y` is `auto|scroll`, or hardcode `.NoteEditor`, or pass the scroll-container ref explicitly into `app_editor_mount`. Cleanest: have `note_editor.svelte` pass the `.NoteEditor` element to the mount action so the service reads/writes the correct scroller.

### 3.2 scroll-fraction (source) vs scroll-top (visual) models don't match

**`src/lib/app/orchestration/app_actions.ts:382-388`** (visual→source toggle):
```js
const scroll_top = services.editor.get_scroll_top();           // 0 in visual (§3.1)
const markdown_len = flush_result.markdown.length;
editor_store.set_scroll_fraction(
  markdown_len > 0 ? Math.min(scroll_top / (markdown_len * 0.5), 1) : 0,
);
```
Because `get_scroll_top()` returns 0 in visual mode, `set_scroll_fraction(0)` is always saved when leaving visual. Source→visual preserves a fraction; visual→source loses it — asymmetric. The fraction heuristic (pixels ÷ character count) is also a rough proxy that would be inaccurate even with a correct `scroll_top`.

**Fix direction:** Unify on scroll-fraction (0..1) on both sides, computing the visual fraction from the **correct** scroller (`scrollTop / (scrollHeight - clientHeight)`). Fix the scroller reference (§3.1) first.

### 3.3 Cursor restore + `focus()` race ahead of scroll restore → "bottom of page"

**`src/lib/reactors/editor_sync.reactor.svelte.ts:95-111`**
`open_buffer` calls `this.focus()` → `view.focus()`, which scrolls the selection into view. If the restored cursor offset is near the document end, `focus()` scrolls the end into view → page jumps to bottom. The scroll restore runs in the next rAF but sets `scrollTop = 0` on the wrong element (§3.1), so nothing corrects it back.

**Fix direction:** After fixing §3.1, use `view.focus({ preventScroll: true })` to avoid focus-induced scroll, then explicitly set the saved scroll position after content measures (two rAFs).

### 3.4 Dialog/omnibar open-close causes a focus-driven jump

When the omnibar/dialog opens, focus leaves ProseMirror → dialog input. When it closes, focus is restored to the editor. If that restore calls `view.focus()` without `preventScroll`, `.NoteEditor` jumps to bring the selection into view. Because scroll was never correctly saved (§3.1), there's nothing to re-apply. The only `preventScroll` usage today is `link_tooltip_plugin.ts:376` and `select-content.svelte:16`.

**Fix direction:** Ensure editor refocus on dialog close uses `preventScroll: true`. Fix §3.1 so saved scroll can be re-applied after focus returns. Audit bits-ui Dialog's internal focus-restore (it may call `el.focus()` without `preventScroll`).

---

## 4. P1 — HTML preview issues

### 4.1 Two divergent CSPs enforced jointly (fragile)

The code-block HTML preview is governed by **two independent CSPs**:
- **Meta CSP** in the srcdoc: `src/lib/features/editor/adapters/code_preview.ts:30-41` (`PREVIEW_CSP`)
- **Header CSP** from the Rust handler: `src-tauri/src/shared/live_html.rs:142-169` (`live_html_csp`)

A resource must pass **both**. They diverge significantly:
- `connect-src`: PREVIEW_CSP `https: data: blob:` vs live_html_csp `'none'` (allow_network=false) → **any fetch/XHR/WebSocket is blocked** by live_html_csp.
- `frame-src`: PREVIEW_CSP `https:` vs live_html_csp `data: blob:` → nested iframes blocked by both.
- `script-src`: PREVIEW_CSP `'unsafe-inline' https:` vs live_html_csp `'unsafe-inline' 'unsafe-eval' blob: data:` → only **pure inline** scripts pass both; remote scripts blocked by live_html_csp; `blob:`/`data:`/`eval` scripts blocked by PREVIEW_CSP.

A comment in `live_html.rs:138-141` claims they're "kept in lockstep" — they are **not**. This is a latent correctness bug: previews that fetch remote data or load nested frames fail silently.

**Fix direction:** Single-source the CSP — generate it in one place (Rust header is authoritative) and have the srcdoc not include a meta CSP (or include an identical one). Reconcile `connect-src`/`frame-src`/`script-src`. Add a visible error state in the iframe when `html_live_register` fails (currently errors are only logged, `code_block_view_plugin.ts:633-635`).

### 4.2 Auto-preview gating gap vs open-knowledge

The preview only auto-shows when the fence meta contains `preview` (`code_block_view_plugin.ts:543-546`, `meta_has_token`). A bare ` ```html` does **not** auto-preview — the user must click "Preview." Open-knowledge auto-shows the preview for `html`/`xml` languages.

**Fix direction:** Consider auto-showing the preview for `html`/`xml`, or surface the `preview` meta token more prominently in the UI (e.g. a hint in the language picker).

### 4.3 HTML file-embed sandbox blocks scripts (separate path)

**`src/lib/features/editor/adapters/file_embed_view_plugin.ts:189-221`** — HTML file embeds use `sandbox="allow-same-origin"` (without `allow-scripts`), so scripts do not execute. Deliberate safety, but an embedded `.html` with `<script>` won't run — different from the code-block preview path which does allow scripts.

**Fix direction:** If interactive HTML embeds are wanted, add an opt-in trusted mode (`allow-scripts allow-same-origin`) gated on a setting or `trusted` meta token; otherwise document embeds as static-only.

### 4.4 What open-knowledge does (reference)

Open-knowledge's code-block HTML preview (`packages/app/src/editor/extensions/CodeBlockView.tsx` + `preview-iframe-header.ts`):
- `<iframe sandbox="allow-scripts" srcDoc={...}>` — **omits `allow-same-origin`** to force a null origin, so embedded JS cannot read the parent's cookies/localStorage.
- Injects a single `<meta http-equiv="Content-Security-Policy">` as the **first** thing in `srcDoc`, before any user content.
- Bakes the theme into `srcDoc` at mount AND posts theme updates via `postMessage` so dark-mode toggles propagate without remounting (preserves scroll position + running scripts).
- Uses a `ResizeObserver` inside the iframe posting height back → auto-height without cross-origin measurement.
- Listens for `securitypolicyviolation` inside the iframe and surfaces a dismissable notice — users see *why* their preview is incomplete instead of silently broken.
- Keeps the source `<pre>` mounted but clipped (`max-height:0; overflow:hidden; pointer-events:none`) rather than `display:none` — preserves caret/undo.

---

## 5. P1 — `each_key_duplicate` error (BUG_REPORT #3)

### 5.1 Component-level guard missing

**`src/lib/features/settings/ui/theme/css_token_reference.svelte:86`**
```svelte
{#each cat.tokens as token (token)}
```
Keys by the raw CSS-property string. This had this exact bug before: commit `923b7430` fixed a duplicate `--editor-code-bg` in the `Editor` category at the **data** level, but the component-level guard (dedup in the derived `filtered_categories`, lines 39-48) was never added. Any future duplicate token within a category re-triggers `each_key_duplicate`. Searching 'card' reproduces if any `card`-matching token (e.g. `--card`) is duplicated in its category.

**Fix direction:** Dedupe each category's tokens in the `filtered_categories` derived:
```ts
tokens: [...new Set(cat.tokens.filter((t) => t.toLowerCase().includes(search.toLowerCase())))]
```

### 5.2 Omnibar latent duplicate-key risk

**`src/lib/features/search/ui/omnibar.svelte:317`**
```js
sorted_commands = [...COMMANDS_REGISTRY, ...plugin_commands].sort()
```
The no-query default view is **not deduped by id**. If a plugin command and a built-in command share an id, `get_item_id` produces duplicate keys. Not triggered by 'card' (the note results are path-deduped), but a latent bug.

**Fix direction:** Dedupe `sorted_commands` by `get_item_id` in `apply_omnibar_view` (`omnibar_actions.ts:139`).

---

## 6. P2 — Residual 2026-07-02 items

### 6.1 Native vibrancy for glass themes (P2 #1)

`window-vibrancy` is in `Cargo.lock` but not used anywhere in `src-tauri/src` (grep clean). Carbide has CSS glass (`surface_style: glass` in `theme.ts`) but no OS material behind it, so glass themes float on opaque windows. Add native vibrancy/blur via Tauri `WindowEffects` (macOS `NSVisualEffect` / Windows acrylic-mica) + a `data-tauri-material` class so only outer-canvas surfaces go alpha-aware. Gate behind glass/transparent surface styles only.

### 6.2 Linux/Windows titlebar controls (P6)

`lattice_title_bar.svelte` is platform-aware for macOS (native traffic lights + `MACOS_TRAFFIC_LIGHT_SAFE_PADDING` + `data-tauri-drag-region`), but has **no Linux/Windows window controls** — no min/max/restore/close buttons, no resize handles, no maximized-state observer. Tolaria's `LinuxTitlebar.tsx` has all of these (32px bar, 8 resize handles, `onResized` maximize/restore icon swap, `data-no-drag` on buttons). Rebuild the bar in Svelte with these controls for non-macOS.

### 6.3 Theme catalog pruning (P7)

~25 theme CSS files remain. The combinatorial space (themes × layout variants × density × surface_style × scheme) is untestable and dilutes polish. Cut to a curated 2-4 themes. Keep the OKLCH engine and token tiers intact. Consult `docs/architecture.md` decision tree first — this touches core theme types.

### 6.4 Global affordance rule sweep (P8 #2)

`component_overrides.css:110` has one `cursor: pointer` rule, but `editor.css` still has **46 scattered** `cursor: pointer` declarations. Add a global base-layer rule (`button:not(:disabled), [role="button"], [role="menuitem"], [role="option"] { cursor: pointer }`) and remove the scattered declarations. This is the tolaria/open-knowledge pattern (`tolaria/src/index.css:426-435`, `open-knowledge/packages/app/src/globals.css:366-369`).

### 6.5 Two-pane slash live preview (P5)

`slash_command_previews` exist but there's no two-pane `listbox` + `aside` structure. Graft open-knowledge's pattern: `role="listbox"` items left, right-side `<aside>` rendering the selected item's live preview (Svelte snippet in place of React `render()`), keyboard + hover selection, `onMouseDown preventDefault` focus-steal prevention, full ARIA (`listbox`/`option`/`aria-activedescendant`).

---

## 7. P2 — New adoptable patterns (not in 2026-07-02 plan)

Ranked by polish-per-effort for a Svelte port. Each is framework-agnostic CSS or a small TS pattern.

### 7.1 `overflow-anchor: none` on editor scroll container

**Source:** `tolaria/src/components/Editor.css:66-75`

Prevents the browser from shifting the scroll position when side menus / block decorations appear near the viewport edge. One line on `.NoteEditor`. High-value for any ProseMirror/BlockNote editor.

### 7.2 `transition: none !important` scoped to editor surface

**Source:** `tolaria/src/components/Editor.css:513-518`

```css
.editor-container *, .editor-container *::before, .editor-container *::after {
  transition: none !important;
  animation: none !important;
}
```
Kills hover/insert flicker from ProseMirror plugins and contenteditable reflows. The single highest "feels professional" lever. Preserves cursor blink and text selection. Tolaria deliberately scopes this to the editor surface only — chrome around it may still animate.

### 7.3 `subtle-scrollbar` utility + `overscroll-behavior: contain` on floating scroll surfaces

**Source:** `open-knowledge/packages/app/src/globals.css:2179-2181` (30+ call sites)

```css
.subtle-scrollbar {
  scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/30;
}
```
Apply to slash menus, command palette, dropdowns, dialogs, panels. Eliminates the "scroll-chains to editor" bug class without JS wheel handlers. Pair with `overscroll-behavior: contain` on every floating scroll surface.

### 7.4 Sticky table header + first column

**Source:** `open-knowledge/packages/app/src/editor/extensions/frozen-table-headers.ts` + `globals.css:1720-1841`

Open-knowledge uses `position: sticky; left: 0` on `td:first-child`/`th:first-child` for horizontal scroll freeze, and `overflow: clip` (not `hidden`) on the `<table>` so sticky works. The sticky header uses WAAPI + `ScrollTimeline`. Carbide's tables currently have no sticky header/first-column. A CSS-only sticky first-column is cheap; the scroll-driven sticky header is more involved.

### 7.5 `content-visibility: auto` on chunked doc children

**Source:** `open-knowledge/packages/app/src/globals.css:4974-4977`

```css
.ProseMirror .ok-chunk-wrapper {
  content-visibility: auto;
  contain-intrinsic-size: 0 var(--ok-cv-h, 80px);
}
```
Big-doc render perf for free — off-viewport children skip layout/paint. Carbide could wrap top-level PM children in a `Decoration.node` with this property. Relevant for large notes.

### 7.6 `onMouseDown preventDefault` on all floating menus

**Source:** `open-knowledge/packages/app/src/editor/slash-command/SlashCommandMenu.tsx:28,48,81,121-124`

Keeps focus in the editor so typing continues while a floating menu (slash, mention, tag, wiki-link, path-suggestion) is open. The canonical ProseMirror/TipTap pattern. Carbide's slash menu may already do this (verify); extend to all floating menus.

### 7.7 High-fidelity skeletons that mirror loaded layout

**Source:** `tolaria/src/components/SidebarLoadingSections.tsx:53-75,142-170`

`animate-pulse` bars with real widths and the type-color system's accent icons, all `aria-hidden`. No layout shift on load. The skeleton *is* the loaded shape, just greyed. Effort: medium; payoff: the app never feels like it "pops in."

### 7.8 Per-type accent color roles

**Source:** `tolaria/src/utils/typeColors.ts`

A `type → --accent-*` map with a `color-mix` fallback for custom hexes (`CSS_COLOR_LIGHT_MIX = 14`). Gives tags/note-types a persistent color identity across surfaces and automatic dark-mode support. Single source of truth. Only worth building after the zinc→token sweep (P1, done).

### 7.9 `button:active scale(0.97)` universal micro-interaction

**Source:** `open-knowledge/packages/app/src/globals.css:2172-2177`

```css
button:active:not(:disabled) { transform: scale(0.97); }
```
One rule, every button feels responsive. Gated by `prefers-reduced-motion`. 160ms `--ease-out-strong`.

### 7.10 Print/PDF export `@media print` block

**Source:** `tolaria/src/components/Editor.css:315-404`

Hides chrome, resets colors to `#fff/#111`, sets `break-inside: avoid` on blocks/figures/tables/pre, hides copy/fullscreen/resize chrome. So "Export PDF" produces a clean document, not a screenshot of the app.

### 7.11 Fatal-error overlay

**Source:** `tolaria/src/main.tsx:131-161`

A `position:fixed; inset:24px; z-index:2147483647` dark `<pre>` with the error stack if rendering crashes — the user is never left staring at a blank window. Port to Svelte as an error boundary in `+layout.svelte`.

### Honorable mentions (lower effort)

- **90px macOS traffic-light safe-padding** applied contextually (`tolaria/src/utils/platform.ts:3`) — Carbide has this in `lattice_title_bar.svelte` but verify it's applied to all leftmost UI (collapsed sidebar headers, etc.).
- **1px borders via `inset 0 0 0 1px` box-shadow** instead of `border` (`tolaria/src/App.css:8`) — crisper, no layout shift.
- **Instant tooltips** with `collisionPadding: 8` and `text-balance` (`tolaria/src/components/ui/tooltip.tsx`).
- **Scroll-edge fade masks** via `@property` + `animation-timeline: scroll(self)` (`open-knowledge/packages/app/src/globals.css:2203-2400`) — position-aware fade on scrollable regions, static fallback for Firefox.
- **`@starting-style` for mount animations** (`open-knowledge/packages/app/src/globals.css:2154-2161`) — graceful entry for presence badges, composer.
- **Hover-revealed chrome with innermost-wins via `:has()`** (`open-knowledge/packages/app/src/globals.css:4530-4534`) — only the innermost hovered block shows its chrome bar.

---

## 8. Ranked fix roadmap

Merged priority order across all sections. P0 = bugs affecting daily use; P1 = bugs with workarounds; P2 = polish/residual.

| # | Priority | Item | Section | Effort |
| --- | --- | --- | --- | --- |
| 1 | P0 | Fix mermaid wheel hijack (gate behind Ctrl/Cmd or fullscreen) | §2.1 | Small |
| 2 | P0 | Fix `get_scroll_top`/`set_scroll_top` scroller reference | §3.1 | Small |
| 3 | P0 | Remove `max-height` + `overflow-y: auto` from `.ProseMirror pre`, `.tableWrapper`, `.note-embed__content` | §2.2-2.4 | Small |
| 4 | P0 | Add `overscroll-behavior: contain` to surviving nested scrollers + `.NoteEditor` | §2.6 | Small |
| 5 | P0 | Use `preventScroll: true` on editor refocus (dialog close, tab restore) | §3.3-3.4 | Small |
| 6 | P1 | Single-source the HTML preview CSP; add visible error state | §4.1 | Medium |
| 7 | P1 | Dedupe `css_token_reference.svelte` tokens in derived; dedupe omnibar `sorted_commands` | §5.1-5.2 | Small |
| 8 | P1 | Unify scroll-preservation on fraction (0..1) both sides | §3.2 | Medium |
| 9 | P1 | Auto-preview for `html`/`xml` code blocks (or surface `preview` meta) | §4.2 | Small |
| 10 | P2 | `overflow-anchor: none` + `transition: none !important` on editor surface | §7.1-7.2 | Small |
| 11 | P2 | `subtle-scrollbar` utility + `overscroll-behavior: contain` on floating surfaces | §7.3 | Small |
| 12 | P2 | Global affordance rule; remove 46 scattered `cursor: pointer` in `editor.css` | §6.4 | Small |
| 13 | P2 | Linux/Windows titlebar controls (min/max/restore/close, resize, maximized observer) | §6.2 | Medium |
| 14 | P2 | Native vibrancy for glass themes | §6.1 | Medium |
| 15 | P2 | Two-pane slash live preview | §6.5 | Medium |
| 16 | P2 | `button:active scale(0.97)` + print export + fatal-error overlay | §7.9-7.11 | Small |
| 17 | P2 | High-fidelity skeletons + per-type accent roles | §7.7-7.8 | Medium |
| 18 | P2 | Sticky table header/first-column + `content-visibility: auto` | §7.4-7.5 | Medium |
| 19 | P2 | Prune theme catalog to curated 2-4 themes | §6.3 | Large |

---

## 9. Gaps in tolaria/open-knowledge worth NOT copying

- **tolaria has no `prefers-reduced-motion` guard** anywhere — Carbide already has this (better).
- **tolaria has no formal motion/duration tokens** — durations sprinkled inline. Carbide's `--duration-*`/`--ease-*` tokens are better; keep them.
- **tolaria tables have no sticky header and no custom wheel handling** — fine for tolaria, but Carbide tables are tall; add sticky.
- **Neither rival styles scrollbars globally** — a subtle 8-10px themed scrollbar (Carbide's `--scrollbar-thumb` tokens) is a noticeable upgrade. Keep Carbide's approach.
