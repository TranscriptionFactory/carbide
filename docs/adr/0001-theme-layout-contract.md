# ADR 0001 — Theme/layout contract: token-only themes, first-class layout modes

- Status: accepted (2026-07-19)
- Decision drivers: theme×layout coupling caused a regression treadmill (~615 QA cells,
  122 `!important` repo-wide, order-indexed deep selectors rotting on every DOM change).

## Context

Carbide shipped ~42 builtin theme ids from 23 blueprints (`src/lib/shared/types/theme.ts`),
plus 14 `theme-*.css` files carrying *structural* CSS — `position: absolute` chrome
relocation, deep `[data-pane][order=N]` selectors into paneforge/shadcn internals, and
CSS-vs-inline-style `!important` warfare. Themes forced layout (`layout_variant`), layout
lived in skin CSS, and DOM changes silently rotted order-indexed selectors (both the
spotlight and theater files ended up pinning the *outline* pane with rules written for the
context rail, while their `.ContextRail` rules matched nothing).

The style substrate is one merged `src/styles/tokens.css` plus an
`@layer` cascade; theme override blocks live unlayered in `src/styles/themes.css` so they
beat all layers. The kept lived-in set is **Obsidian, Spotlight, Theater, Glass**; the rest
of the catalog is culled.

## Decision

**Two rules: themes may only recolor; layout belongs to layout components.**

### 1. The theme contract

A theme is exactly one of:

- a **token-only `[data-theme="X"][data-color-scheme="Y"]` block** (~60 lines) in
  `src/styles/themes.css`, or
- a **`palette_generator` preset**: 4 numbers (`surface_hue`, `surface_chroma`,
  `accent_hue`, `accent_chroma`) + optional token overrides.

**Zero component selectors and zero `!important` in theme definitions.** A theme block may
contain only custom-property declarations (including affordance-flag values like
`--statusbar-shape`). It may not name a class, a `data-slot`, a `[data-pane]`, or any
element.

**Enforcement**: `scripts/lint_layering_rules.mjs` (wired as `pnpm lint:layering`, first in
`pnpm lint`) carries a theme-contract pass:

- Scope: `src/styles/themes.css` and any `src/styles/theme-*.css` (post-cull that glob must
  match nothing; a match is itself a violation).
- Inside a `[data-theme]` block every declaration must be a `--*` custom property, and every
  selector must match `^(html)?\[data-theme(="…")?\](\[data-color-scheme(="…")?\])?$` — no
  descendant combinators, no class/element/attribute selectors beyond the two attributes.
- `!important` anywhere in scoped files → error; component-class selectors (`.ActivityBar`,
  `.TabBar`, `.StatusBar`, `.SidebarPanel`, `.WorkspaceLayout`, `.NoteEditor`,
  `.ContextRail`, `[data-slot=`, `[data-pane`) → error.
- Violations fail with named file/line and nonzero exit, same as existing layering rules.

### 2. Layout modes are first-class, never CSS force-reflows

Layout variants become **layout presets** (a named bundle of parameter values over the
default layout) plus at most **one structural capability** built into the default layout
component in Phase 2. Per-variant decomposition verdicts (adopted):

| Variant | Verdict | Shape |
| --- | --- | --- |
| **Obsidian** | **preset** (high confidence) | Pure paint. 4 parameters: `--chrome-blur: 20px` (unifies the old 16/20/24 spread), `--workspace-backdrop` (dual `--accent-glow` radial gradients), `--workspace-grain` (4px dot-grid, 4% dark / 6% light), `--panel-radius: var(--radius)`. Zero structure; needs ~4 inert base consumption rules in the components layer. |
| **Spotlight** | **hybrid → preset**, contingent on a `panels: docked\|overlay` mode | 8 parameters: editor-width 80ch (via the *setting*, not token shadowing), sidebar-width 18rem pinned, `--statusbar-shape: floating-pill`, activitybar-mode floating-dock, tabbar-mode floating-pill (36rem, fill-active), `--chrome-idle-opacity` 0.35/0.4, `--chrome-glass` (card@80% + blur 16px), pill radii/shadows. One structure item: overlay side panels (all of its `!important` existed only to defeat paneforge inline flex). |
| **Theater** | **hybrid → preset**, contingent on `chrome-mode: edge-reveal` | 8 parameters: `chrome-mode: edge-reveal`, editor-width 80ch, sidebar-width 20rem, `--statusbar-shape: floating-pill`, `--tab-active-indicator: fill`, `--radius: 0.75rem`, reveal motion from existing motion tokens, edge-width 3px. One structure item: sidebar/rail as fixed-width overlays outside the resizable pane system — a conditional DOM fork in `workspace_layout.svelte`, the pattern zen mode already uses. |

Both structure items are **overlay side surfaces**. Phase 2 builds this **once** into the
single default layout — a `panels: "docked" | "overlay"` render branch (the overlay branch
also hosts theater's edge-reveal chrome flags) — not per-variant `WorkspaceLayout`
components. Outcome: **1 real mode + 3 presets**. Chrome reshaping (floating pills, edge
strips, collapse/reveal) is component-owned CSS keyed off affordance flags
(`data-statusbar-shape` precedent), never theme CSS.

The `layout_variant` theme field is severed: the theme picker selects a recolor; the layout
preset is chosen independently (a theme may *suggest* a default pairing).

### 3. The 6 kept themes and the cull

**Kept (5 blueprints → 10 ids)**: **Carbide Light / Carbide Dark** (Nordic renamed;
hand-tuned per-token defaults) + **Obsidian, Spotlight, Theater, Glass** as token-only
recolors. Glass was already recolor-only.

**Culled (18 blueprints → 32 ids)**: brutalist, neon, paper, floating, dense, linear,
monolith, workbench, command-deck, grounded-heavy, hud, zen-deck, dashboard, cockpit,
triptych, lattice, drift, terminal — plus their 11 `theme-*.css` files, `+layout.svelte`
imports, 11 `WorkspaceLayout--*` class flags/deriveds, the LatticeTitleBar DOM fork, and
the culled `themes.css` blocks.

**Resurrectability**: any culled theme is recoverable from git history as a ~60-line token
block under the new contract — its palette survives; only its structural CSS is gone by
design.

**Identity preservation**: a kept theme's look is more than palette — obsidian's glow+grain
backdrop, spotlight's idle-fading glass pills, theater's accent edge strips. Each is carried
as tokens/affordance values in the theme block.

### 4. Accent identity

**Default accent = purple `#7e1dfb`** (user decision). `#7e1dfb` is converted to OKLch
programmatically; `--accent-hue`/`--accent-chroma` defaults are set so the rendered accent
matches `#7e1dfb` (nearest in-gamut). `#155DFF` remains the semantic `--accent-blue` role.
Theater's edge strips render purple — a sanctioned identity change, not a regression.

### 5. Migration mechanics

- **Fallback mapping**: `remap_theme_id()` in `theme_service.load_themes()` applied to all
  three persisted id keys, suffix-preserving, character-matched: nordic→carbide (rename);
  brutalist/dense/linear/monolith/workbench/lattice→carbide; paper/triptych/zen-deck→
  spotlight; neon/command-deck/cockpit/terminal/grounded-heavy/hud→theater;
  dashboard/drift→obsidian; floating→glass; unknown→carbide by `-light`/`-dark` suffix.
  Remapped values are persisted once; `resolve_theme`'s hard fallback targets
  `carbide-dark`; UUID user themes pass through.
- **FOUC cache**: `carbide_active_theme_cache` gains `v: 2`; the prepaint script applies
  only color-scheme for non-v2 caches and allowlists `data_theme` against the kept set.
  `apply_theme.ts` shrinks from ~52-80 inline `setProperty` calls to attributes + a small
  override set (accent hue/chroma, fonts, editor typography prefs, user `token_overrides`);
  kept themes live as static CSS blocks. The apply_theme change and the cache version bump
  land together, never separately.
- **Shiki remap**: no-op — every culled builtin resolved to the `github-light`/`github-dark`
  defaults.

## Consequences

- **Deleted**: 18 blueprints, 11 `theme-*.css` files + eventually
  `theme-{spotlight,theater,obsidian}.css` once decomposed, culled `themes.css` blocks,
  LatticeTitleBar + fork, `LAYOUT_TO_DATA_THEME`/`resolve_data_theme`, all theme-CSS
  `!important` and all order-indexed deep selectors. `ThemeLayoutVariant` →
  `"default"|"spotlight"|"theater"|"obsidian"`; `ThemeCssTheme` → `"carbide"|"glass"`.
- **QA surface**: ~615 cells → ≤8 (2 color schemes × (default + overlay mode + presets that
  share their DOM)).
- **Themes become inspectable**: a theme switch is 5-6 attributes + a static CSS block
  visible in DevTools' cascade, not ~80 inline properties.
- **If the contract is violated**: a component selector or `!important` in a theme block
  reintroduces theme×layout coupling and the QA surface multiplies again. The lint pass
  makes violation a lint failure, not a review judgment call.
- **Costs**: no more per-theme structural expression — a future theme wanting new geometry
  must first land a parameter/affordance or a layout-mode capability (this friction is the
  point); one launch after upgrade renders default-theme-correct-scheme while the v2 cache
  rewrites; `editor_tuning_panel.svelte` was orphaned and is dropped (resurrectable from git
  history).
- **Re-evaluation trigger**: a fourth genuine structural mode, or user-authored themes
  needing more than tokens + palette presets.
