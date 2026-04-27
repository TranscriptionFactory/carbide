# Carbide UI — Token Architecture Spec

> Companion to the prototype in `Carbide UI Redesign.html`. This is what a developer needs to wire the system into the real Svelte/Tauri app.

## TL;DR

Today every Carbide theme overrides the same flat surface of CSS variables. To support **radically different feels** — paper-zen, IDE-cockpit, terminal-phosphor — without each theme re-stating every token, we split tokens into three tiers and let a theme override at any layer.

```
Tier 1 — Primitives  → palette, scale, motion, type    (rarely overridden)
Tier 2 — Semantic    → background, foreground, border  (most overrides land here)
Tier 3 — Component   → sidebar, editor, tab, statusbar (specialty themes only)
```

Tweak axes (density, radius, accent hue) are **orthogonal** to themes — they rewrite primitives and compose with any theme.

---

## File layout

```
src/app.css           ← imports
src/styles/tokens.css ← Tier 1 + Tier 2 defaults (light/dark)
src/styles/themes.css ← Tier 2/3 overrides per [data-theme]
```

Today's `app.css` becomes a thin orchestration file:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "./styles/tokens.css";
@import "./styles/themes.css";

@custom-variant dark (&:is([data-color-scheme="dark"] *));

@theme inline {
  /* shadcn tokens map straight through — no rename needed */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* …unchanged… */
}
```

## Compatibility with current shadcn tokens

**Every shadcn token name is preserved at the semantic tier.** No component-level rename is needed. The new tokens are *additive*:

| Today (kept)            | New (added)                          |
| ----------------------- | ------------------------------------ |
| `--background`          | `--background-surface-2/3` (layered) |
| `--foreground`          | `--foreground-secondary/-tertiary`   |
| `--border`              | `--border-strong`, `--border-subtle` |
| `--accent`              | `--accent-hover`                     |
| `--ring`                | `--focus-ring` (alias)               |
| `--primary`             | `--interactive`, `--interactive-hover` |
| `--sidebar-*` (kept)    | `--sidebar-active-bar`, `--sidebar-muted-foreground` |
| —                       | `--editor-*`, `--tab-*`, `--statusbar-*` (Tier 3) |

`--interactive` is the new canonical name for "the thing that draws focus" (links, selection bar, ring). `--primary` stays as the shadcn button-fill alias and points at it for most themes; a theme can decouple them if it wants a chromatic primary button on a neutral interactive accent.

---

## Tier 1 — Primitives

Themes rarely touch these. Tweaks (`--density`, `--radius`, font pairing) rewrite them.

```css
:root {
  --density: 1;
  --radius: 6px;

  --space-1..12: 4..48px;          /* 4px-base scale */
  --text-xs..2xl: 11..28px;        /* type scale */
  --font-sans, --font-serif, --font-mono;
  --font-ui, --font-body, --font-code;  /* role aliases — themes flip these */

  --duration-fast/normal/slow;
  --ease-default, --ease-out;

  --size-titlebar: calc(34px * var(--density));   /* chrome scales w/ density */
  --size-activity-bar, --size-statusbar, --size-tabbar, --size-row;

  --shadow-1/2/3;
}
```

### Density (Tweaks)

```css
[data-density="compact"] { --density: 0.85; }
[data-density="regular"] { --density: 1;    }
[data-density="airy"]    { --density: 1.18; }
```

Type sizes are **not** multiplied by density — readability stays constant; only chrome breathes.

### Radius (Tweaks)

```css
:root            { --radius: 6px; }   /* default */
[data-radius="sharp"] { --radius: 0px; }
[data-radius="soft"]  { --radius: 12px; }
```

### Accent hue (Tweaks)

A slider rewrites `--interactive` / `--ring` / `--focus-ring` at the semantic tier with the user's hue at constant L/C. Themes that don't use a chromatic accent (Paper, Terminal) ignore it.

---

## Tier 2 — Semantic

The shadcn surface, plus a few additions. Light is the default; dark is `[data-color-scheme="dark"]`. Every theme override block lives at this tier.

```
--background, --background-surface-2, --background-surface-3
--foreground, --foreground-secondary, --foreground-tertiary
--card, --card-foreground
--popover, --popover-foreground
--primary, --primary-foreground
--secondary, --secondary-foreground
--muted, --muted-foreground
--accent, --accent-foreground, --accent-hover
--interactive, --interactive-hover
--destructive, --success, --warning
--border, --border-strong, --border-subtle
--input, --ring, --focus-ring
```

---

## Tier 3 — Component

Surface-specific tokens that point at semantic tokens by default and only get overridden when a theme wants a surface to look *different from the rest of the app*. This is the layer that unlocks "radically different feels."

```
sidebar:  --sidebar, --sidebar-foreground, --sidebar-muted-foreground,
          --sidebar-accent, --sidebar-accent-foreground, --sidebar-border,
          --sidebar-active-bar
editor:   --editor-background, --editor-foreground, --editor-gutter,
          --editor-selection, --editor-link, --editor-heading, --editor-code-bg
tabs:     --tab-active-bg, --tab-active-fg, --tab-inactive-bg, --tab-inactive-fg, --tab-border
statusbar:--statusbar-bg, --statusbar-fg, --statusbar-divider, --statusbar-segment-pad
```

**Rule:** components reference Tier 3 tokens, never Tier 2 directly. Tier 3 defaults are aliases (`--editor-background: var(--background)`) so a theme that doesn't care never has to declare them.

### Affordance contract (Tier 3.5)

Some surfaces need to **reshape**, not just recolor — the cockpit status bar splits into segmented blocks, paper drops the bar entirely, terminal inverts the active row, paper renders headings without prefixes while terminal prepends `#`. These aren't expressible as recoloring, but they're still finite, named choices.

The contract lives as **string-valued custom properties**, with a fixed set of accepted values per slot. A theme picks one; the components handle the rest. There are no `[data-theme="x"]` selectors anywhere in component CSS.

| Token                       | Values                                       | Effect                                                                |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| `--statusbar-shape`         | `"bar"` · `"transparent"` · `"segments"`     | Solid bar (default), background-blended, or padded chromatic blocks   |
| `--tab-active-indicator`    | `"underline"` · `"border"` · `"fill"` · `"none"` | How the active tab is marked                                          |
| `--tab-active-indicator-color`     | any color token                          | Defaults to `--interactive`                                           |
| `--tab-active-indicator-thickness` | px                                       | 2px default                                                           |
| `--sidebar-active-shape`    | `"ribbon"` · `"fill"` · `"weight"` · `"invert"` | Active row treatment: side bar (default), accent fill, weight-only, full color invert |
| `--heading-prefix-h1/2/3`   | string (`""` to disable)                     | Editor heading prefix — `"# "` for terminal, empty otherwise          |
| `--heading-prefix-color`    | any color token                              | Defaults to `--foreground-tertiary`                                   |

#### Wire-up

CSS can't `[attr=]`-match against a custom property string, so the affordance flags are **mirrored** to data attributes on `<html>` once at theme-apply time. In the prototype this lives in the same `useEffect` that sets `data-theme`:

```ts
const cs = getComputedStyle(root);
const mirror = (cssVar: string, attr: string) => {
  const v = cs.getPropertyValue(cssVar).trim().replace(/^"|"$/g, "");
  if (v) root.setAttribute(attr, v);
};
mirror("--statusbar-shape",      "data-statusbar-shape");
mirror("--tab-active-indicator", "data-tab-indicator");
mirror("--sidebar-active-shape", "data-sidebar-active");
```

In the real Svelte app, this is a 10-line module called from the same place that swaps `data-theme` today.

#### Component CSS uses contract attrs, never theme name

```css
/* GOOD — theme-agnostic, driven by the contract */
[data-statusbar-shape="segments"] .StatusBar__group {
  padding: 0 var(--statusbar-segment-pad);
  border-left: 1px solid var(--statusbar-divider);
}
[data-statusbar-shape="segments"] .StatusBar__group--git { background: oklch(0.55 0.18 250); color: white; }

/* BAD — locks the reshape to a single theme */
[data-theme="cockpit"] .StatusBar__group--git { … }
```

This is the rule that keeps the architecture extensible: *adding a new theme cannot require editing component code*. A theme that wants segmented status looks declares `--statusbar-shape: "segments"` and inherits the layout for free. A future "Linear-style" theme can use the same `"segments"` value with its own divider color and segment padding.

#### Adding a new affordance

When a future theme needs a reshape that no current value covers (e.g. *floating* tabs, *gutter-style* sidebar active rows), the procedure is:

1. Add the new value to the table above.
2. Add a `[data-X="newvalue"]` rule block in `shell.css`.
3. Existing themes are unaffected; they keep their existing flag values.

The contract is **closed but extensible** — new affordances are intentional, reviewed additions, not free-for-all per-theme overrides.

---

## Theme authoring

A new theme is a single CSS block. Here's the entire `Paper Zen` definition (~30 lines):

```css
[data-theme="paper"] {
  --font-ui: var(--font-serif);
  --font-body: var(--font-serif);
  --radius: 0px;
  --leading-normal: 1.6;
  --shadow-1: none;
  --shadow-2: none;
}
[data-theme="paper"][data-color-scheme="light"] {
  --background: oklch(0.985 0.012 80);    /* warm off-white */
  --foreground: oklch(0.22 0.01 60);
  --border: oklch(0.88 0.012 70);
  --interactive: oklch(0.40 0.10 30);     /* terracotta */
  --statusbar-bg: transparent;            /* Tier 3 — paper has no chrome bar */
  --tab-active-bg: oklch(0.985 0.012 80);
}
```

That's it — no Tier 1 spacing/scale needed because "generous" is achieved entirely through `--leading-normal` + the type role swap to serif.

### Themes shipping in the prototype

| Theme              | Tier 1 changes                 | Tier 2 changes                | Tier 3 changes              |
| ------------------ | ------------------------------ | ----------------------------- | --------------------------- |
| Carbide Refined    | —                              | (defaults)                    | —                           |
| IDE Cockpit        | mono UI, tighter type, sharper radius, denser chrome | green accent, cool background tint | color-coded statusbar segments |
| Paper Zen          | serif UI, looser leading, no shadow, no radius      | warm palette, terracotta accent | transparent statusbar       |
| Terminal Phosphor  | mono everywhere, sharp, hard chrome             | amber-on-black mono palette    | inverted active row, ASCII heading prefix |

---

## Migration plan (for the existing 20+ themes)

1. **Rename pass** — script over `static/themes/*.css`. The semantic-tier names already match shadcn, so most existing themes need zero changes.
2. **Add Tier 3 fallbacks** to `tokens.css` (`--editor-background: var(--background)`, etc). Existing themes inherit them automatically.
3. **Per-theme audit** — opt themes that *want* a different sidebar/editor look into Tier 3 overrides. The Brutalist/Neon/Glass themes are obvious candidates.
4. **Tweaks** — wire density/radius/accent-hue selectors into the existing settings panel. They rewrite `:root` data attributes.

No theme has to opt in to Tier 3 — they keep working flat. The architecture only *enables* deeper customization.

---

## Component contract

When porting Svelte components, replace Tier 2 references in surface-specific components with Tier 3:

```diff
  .Sidebar {
-   background: var(--sidebar);
-   border-right: 1px solid var(--sidebar-border);
+   background: var(--sidebar);          /* unchanged — already Tier 3 */
+   border-right: 1px solid var(--sidebar-border);
  }
  .Editor {
-   background: var(--background);
-   color: var(--foreground);
+   background: var(--editor-background);
+   color: var(--editor-foreground);
  }
```

Activity bar already uses Tier 3 (`--sidebar-*`) — no changes needed.

---

## What the prototype demonstrates

Open `Carbide UI Redesign.html` and toggle Tweaks (top-right):

- Theme picker — 4 themes at novelty 7
- Color scheme — light/dark per theme
- Density — chrome heights animate via `--density`
- Radius — sharp/default/soft via `--radius`
- Accent hue — slider rewrites `--interactive` at runtime
- Outline panel — toggles a Tier-3-styled secondary surface

All values persist via the host's edit-mode protocol so a refresh keeps your settings.
