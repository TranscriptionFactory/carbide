# Timeline Layout — Token Mapping (prototype → Carbide design system)

**Date:** 2026-06-10
**Status:** Implementation bridge. Feeds the spec of `layout_variant: "timeline"` against `docs/architecture.md`.
**Prototypes:** `designFiles/carbide/v5/Carbide v5 · Atelier.html` (paper) and `… · Atelier-Glass.html` (glass).

This document maps every hardcoded value in the Atelier / Atelier-Glass mockups onto **real Carbide
theme tokens**, so the Timeline layout can be implemented as a theme-driven `layout_variant` that
inherits all existing + future themes (light/dark, any accent, solid/glass/transparent surfaces).

---

## 1. How the theme system actually works (verified)

Source: `src/lib/shared/types/theme.ts`, `src/lib/shared/utils/apply_theme.ts`,
`src/lib/shared/utils/palette_generator.ts`, `src/styles/design_tokens.css`.

`apply_theme()` sets two **independent** attributes on `<html>` and writes generated CSS vars:

- `data-color-scheme` = `"light" | "dark"` — drives the color palette.
- `data-layout-variant` = one of the `ThemeLayoutVariant` enum — drives **structure**.
  Existing values: `default, monolith, grounded_heavy, hud, zen_deck, dashboard, workbench,
  command_deck, spotlight, cockpit, theater, triptych, lattice, obsidian, drift`.
  → **Timeline is added as one new value, e.g. `timeline`.** This is the extension point.
- `surface_style` = `"solid" | "glass" | "transparent"` — `generate_ui_tokens({ style })` applies a
  `glass_alpha` (0.55) to surface tokens when glass. **Glass is a parameter, not custom CSS.**
- `css_theme` already includes `"paper"` — the Atelier identity has a home.

**Consequence:** paper vs glass are the *same Timeline layout* under different `surface_style` /
`css_theme` / hue params. The layout must read tokens, never hardcode the values below.

---

## 2. Real token vocabulary (what Timeline may use)

**Generated per-theme** (`palette_generator.ts`, react to `surface_hue/chroma`, `accent_hue/chroma`,
scheme, `surface_style`):
`--background --foreground --card --card-foreground --popover --popover-foreground --secondary
--secondary-foreground --muted --muted-foreground --foreground-tertiary --background-surface-2
--background-surface-3 --border --border-subtle --border-strong --input --primary
--primary-foreground --accent --accent-foreground --accent-hover --interactive --interactive-hover
--ring --sidebar --sidebar-accent --sidebar-border --scrollbar-thumb --scrollbar-thumb-hover
--destructive --destructive-foreground` — plus **glass:** `--glass --glass-strong` (alpha-bearing).

**Static design tokens** (`design_tokens.css`):
- Interactive: `--interactive-bg --interactive-bg-hover --interactive-muted --interactive-border(-subtle/-strong) --interactive-disabled(-bg) --interactive-text-on-bg --interactive-text-subtle --focus-ring --focus-ring-offset --selection-bg --on-accent --accent-glow`
- Spacing (4px base): `--space-0 –0-5 –1 –1-5 –2 –2-5 –3 –4 –5 –6 –8 –10 –12`
- Sizing: `--size-touch(-xs/-sm/-md/-lg) --size-icon(-xs/-sm/-md/-lg) --size-activity-bar --size-activity-icon --size-status-bar --size-tree-row --size-tree-indent --size-tree-base-padding --size-dialog-(sm/md/lg/xl)`
- Type: `--text-xs(11) –sm(13) –base(14) –md(15) –lg(16)`; `--font-family-sans --font-family-mono`; `--editor-heading-1..6`
- Motion: `--duration-fast(100) –normal(150) –slow(200) –slower(300)`; `--ease-default –in –out –in-out`
- Elevation: `--shadow-xs –sm –md –lg --shadow-color`
- Indicators: `--indicator-clean --indicator-dirty` (git state)
- Z-index: `--z-base –sticky –dropdown –popover –overlay –modal –tooltip`

---

## 3. Skin-token mapping (prototype variable → real token)

| Prototype var | Real token | Notes |
|---|---|---|
| `--canvas` / `--canvas-2` | `--background` / `--background-surface-2` | page background |
| `--surface` | `--card` (solid) / `--glass` (glass) | note/panel body |
| `--panel` | `--secondary` / `--muted` | inset chrome |
| `--fg` / `--fg-2` / `--fg-3` / `--fg-4` | `--foreground` / `--muted-foreground` / `--foreground-tertiary` / *(mix)* | 4th tier → `color-mix(--foreground-tertiary, --background)` |
| `--hairline` / `--hairline-strong` | `--border-subtle` / `--border` (or `--border-strong`) | hairline rules |
| `--hover` | `--sidebar-accent` (sidebar ctx) / `--muted` (generic) | per UI.md hover rules |
| `--accent` / `--accent-ink` / `--accent-soft` | `--interactive` / `--interactive-hover` / `--accent` | selected/active text & icons |
| `--accent-bg` | `--interactive-bg` (+ `--interactive-bg-hover`) | selected backgrounds |
| `--sepia` / `--sepia-bg` | *net-new* secondary accent | see §5 — not in token set today |
| `--dirty` | `--indicator-dirty` | unsaved/git dirty |
| `--glass` / `--glass-strong` | `--glass` / `--glass-strong` | ✅ exact match (glass surface_style) |
| `--glass-2` / `--glass-edge` | *net-new* | prototype used 4 glass tiers; system has 2 — see §5 |
| `--shadow` / `--shadow-lift` | `--shadow-sm` / `--shadow-lg` (+ `--shadow-color`) | UI.md: prefer borders, shadows sparingly |
| `--blur` (22px) | *net-new* `--glass-blur` | blur radius not currently tokenized — see §5 |
| `::selection` | `--selection-bg` | |
| focus outline | `--focus-ring` + `--focus-ring-offset` | required by component checklist |
| `--serif` (prose) | `--font-family-sans` (**Inter**) | decided: no serif — prose reuses Carbide's default sans |
| `--sans` / `--mono` | `--font-family-sans` / `--font-family-mono` | |

---

## 4. Component mapping (Timeline-specific elements)

| Prototype element | Tokens | Reuse / new |
|---|---|---|
| **Top bar** height 46–48px | `--size-status-bar` is 22px → top bar is its own height; `--space-*` padding; bg `--background`+blur | new layout chrome |
| **Mode switcher** pill | bg `--secondary`/`--glass`; active `--card`+`--shadow-sm`; text `--muted-foreground`→`--foreground`; radius pill | new component (composes existing tab pattern) |
| **⌘K bar** | `--card`/`--glass`, `--border-subtle`, `--text-sm`, kbd `--secondary` | reuse omnibar trigger styling |
| **Edge rail tab** | text `--foreground-tertiary`→`--interactive` on hover; `--font-family-mono` `--text-xs` | new (peek affordance) |
| **Edge peek panel** | `--card`/`--glass`, `--border`, `--shadow-lg`, `--z-popover`; transitions `--duration-slow --ease-out` | new (reveal panel) |
| **Folder row** | `--space-1-5/-2` padding, hover `--sidebar-accent`, count `--font-family-mono --text-xs --foreground-tertiary` | reuse tree-row patterns |
| **Stream measure** ~720–770px | *net-new* `--measure-prose` (~68ch) | new layout constant |
| **Stream H1** 26–27px | `--editor-heading-2`-ish or *net-new* `--text-display` | type scale tops at `--text-lg` (16) — see §5 |
| **Day rule date** 21px serif | `--editor-heading-3` size + `--font-family-serif`; today → `--interactive` | new + serif gap |
| **Day rule meta/dow** | `--font-family-mono --text-xs --foreground-tertiary`; line `--border-subtle` | reuse |
| **note-card** | `--card`/`--glass`, `--border-subtle`, radius, `--shadow-sm`, `--space-5` padding | new card variant |
| **compose card** (dashed) | dashed `--border`, bg `--muted`/`--glass-strong` | new |
| **note-card h2** | `--editor-heading-4/5` + `--font-family-serif` | serif gap |
| **prose body** | `--font-family-serif`, `--text-lg`+, `--foreground`; muted `--muted-foreground` | serif gap |
| **checkitem box** | `--interactive-border-strong`; done → `--interactive` bg, `--on-accent` check; uses `--editor-checkbox-size` | reuse editor checkbox tokens |
| **pill-urgent** | `--indicator-dirty` text+border, pill radius | reuse |
| **activity glyph** | bg `--secondary`/`--glass-strong`; edit `--interactive-bg`/`--interactive`; commit → sepia *(new)* | mostly reuse |
| **activity row** hover | `--sidebar-accent`/`--muted` | reuse |
| **act-title / act-sub / act-time** | serif `--text-base` / `--font-family-mono --text-sm --foreground-tertiary` / mono `--text-xs` | serif gap |
| **tag chip** | `--interactive-bg` + `--interactive` text, `--font-family-mono --text-xs`, pill | reuse |
| **doc-title** (editor) 33–34px | *net-new* `--text-display` or `--editor-heading-1` | see §5 |
| **doc link `[[ ]]`** | `--interactive` text, underline `--accent`/`--interactive-muted` | reuse smart-links styling |
| **blockquote** | `--border-strong`/accent bar per `blockquote_style`; text `--muted-foreground` | reuse (theme has blockquote_style) |
| **inline code** | `--muted`/`--glass` bg, `--font-family-mono`; per `code_block_style` | reuse |
| **canvas card** | `--card`/`--glass`, `--border`, `--shadow-lg`; swatch uses graph colors `--graph-node-*` | reuse graph/canvas tokens |
| **canvas dot grid** | `--border-subtle` dots over `--background-surface-2` | new bg |
| **command palette** | `--popover`/`--glass-strong`, `--border-strong`, `--shadow-lg`, `--z-modal`; input serif | reuse omnibar; serif input is new |
| **palette selected row** | `--interactive-bg` + `--interactive` | reuse |

---

## 5. Net-new tokens / components required (the real gaps)

These do **not** exist today and must be decided during the spec (each is a small, theme-consistent addition):

1. ~~`--font-family-serif` + theme field~~ **REMOVED (decided 2026-06-10).** Prose uses **Inter** —
   Carbide's existing `font_family_sans` default. No serif, no new font field/bundling. The `--serif`
   prototype var maps directly to `--font-family-sans`. Atelier is a calm *sans* identity.
2. **Display type scale** — `--text-xs..-lg` tops out at 16px; the stream H1 (27px) and doc-title (34px)
   need larger steps. Either reuse `--editor-heading-1..3` or add `--text-xl / --text-2xl / --text-display`.
3. **Sepia / secondary accent** — prototype uses a warm secondary (`--sepia`) for "today", commit glyphs,
   kickers. Today there's one accent. Options: derive from `accent_hue + offset`, reuse `--indicator-dirty`,
   or add a `secondary_accent_hue` param. Cheapest: reuse existing indicator/warning tokens.
4. **Glass depth tiers + blur token** — prototype uses 4 translucency levels (`--glass`, `--glass-2`,
   `--glass-edge`, `--glass-strong`) and a blur radius; the system ships `--glass` + `--glass-strong` only,
   with no `--glass-blur`. Add `--glass-subtle`, `--glass-edge`, `--glass-blur` to `palette_generator`
   (driven by `glass_alpha`) so all glass surfaces stay consistent.
5. **`--measure-prose`** (~68ch) — the centered reading-column width; a layout constant, not present.
6. **`layout_variant: "timeline"`** — new enum value in `ThemeLayoutVariant`; `workspace_layout.svelte`
   branches on `data-layout-variant` to render the Stream instead of the IDE frame. Likely a sibling
   `timeline_layout.svelte`. (Optionally a `LAYOUT_TO_DATA_THEME["timeline"] = "paper"` default.)
7. **Timeline data source** — the Stream needs a reverse-chrono feed joining: file mtimes (watcher),
   `daily_notes`, `tasks`, and `git` history. No existing aggregate; spec must define the query/store.

---

## 6. Compatibility summary (for the spec's rationale section)

| Axis | Status | Mechanism |
|---|---|---|
| Light / dark | ✅ free | `data-color-scheme` already orthogonal to layout |
| Surface style solid/glass/transparent | ✅ free | `surface_style` param + `generate_ui_tokens` |
| Accent / surface hue, density, spacing | ✅ free | parametric generated tokens |
| Timeline structure | ⚙️ 1 new `layout_variant` | enum + layout component branch |
| Serif prose, display type, sepia, glass tiers | ⚙️ net-new tokens | §5 — small additions |
| `transparent` surface over dense stream | ⚠️ validate | legibility of text-through-blur; per-layout tuning |

**Rule for implementation:** the Timeline layout consumes the tokens in §3–4; it must not hardcode the
prototype's literal colors/fonts. Do that and Timeline becomes "just another layout_variant" wearable by
every current and future theme — paper and glass mockups are then one layout under two `surface_style`s.

---

## 7. Next step

Spec `layout_variant: "timeline"` against `docs/architecture.md` decision tree:
- where the layout branch lives (`workspace_layout.svelte` vs new `timeline_layout.svelte`),
- the §5 net-new tokens as a single theme-token changeset,
- the Stream feed (watcher + daily_notes + tasks + git) as a derived store,
- BDD scenarios: empty vault, no daily note today, dense edit-sweep day, git-dirty state, theme switch
  (paper↔glass↔Nordic Dark) re-skinning the same Stream.
