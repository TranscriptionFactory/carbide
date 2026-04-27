# Handoff: Carbide UI Redesign — Three-Tier Theme Architecture

## What this is

A redesign of the Carbide editor shell (activity bar + sidebar + tabs + editor + status bar) and a **three-tier CSS-token architecture** that lets themes have radically different visual feels without each theme re-stating every variable. Four themes ship as proof: *Carbide Refined*, *IDE Cockpit*, *Paper Zen*, *Terminal Phosphor* — all in light + dark.

## About the design files

The files in `prototype/` are **design references**, not production code. They're an HTML/React prototype that demonstrates the token system and renders the four themes against a mocked editor shell. Your job is to:

1. Port the `styles/` CSS files into the real Svelte/Tauri app (they're framework-agnostic — pure CSS variables).
2. Wire the affordance-flag mirror into the existing theme-apply code (~10 lines of TS).
3. Audit existing Svelte components and replace any direct Tier-2 references with the new Tier-3 surface tokens (`--editor-background` instead of `--background`, etc).

You should **not copy `app.jsx` or `shell.css` literally** — they emulate the Svelte components in React/plain CSS for the prototype. Carbide already has the real `activity_bar.svelte`, sidebar, tabs, editor, etc; the work is rewiring their token references.

## Fidelity

**High-fidelity** for the token system, color values, type scale, sizing, density math, and affordance contracts — every value in `styles/tokens.css` and `styles/themes.css` is final and intended to be copied verbatim. The mocked editor shell layout is illustrative; the real Svelte components keep their existing structure.

## Repository context

- Repo: `TranscriptionFactory/carbide` (fork of Otterly)
- Stack: Tauri 2 · Svelte 5 / SvelteKit · TypeScript · Tailwind CSS 4 · shadcn-svelte
- Existing tokens live in `src/app.css` (flat OKLCH variables, light + dark via `[data-color-scheme]`)
- 20+ themes exist already as flat token overrides (Nordic, Brutalist, Neon, Paper, Glass…)
- Project guidance in `AGENTS.md`: clean refactors OK ("0 users as of now"), prefer shadcn semantic utilities, no inline imports, tests required.

## What ships

```
handoff/
├── README.md              ← this file
├── Token Spec.md          ← full architecture spec (READ FIRST)
├── styles/
│   ├── tokens.css         ← Tier 1 (primitives) + Tier 2 (semantic, light+dark)
│   ├── themes.css         ← Tier 2/3 overrides for the four themes
│   └── shell.css          ← reference component CSS — DO NOT COPY VERBATIM
└── prototype/             ← React prototype, for reference only
    ├── Carbide UI Redesign.html
    ├── app.jsx · icons.jsx · tree.jsx · tweaks-panel.jsx
```

---

## Implementation plan

### Step 1 — Read the spec

Open `Token Spec.md` end-to-end. The three tiers and the **Affordance Contract (Tier 3.5)** are the load-bearing ideas. Don't start coding until both are clear.

### Step 2 — Land the new `app.css`

In the real app, `src/app.css` becomes a thin orchestration file:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "./styles/tokens.css";   /* from handoff */
@import "./styles/themes.css";   /* from handoff */

@custom-variant dark (&:is([data-color-scheme="dark"] *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  /* radius unchanged */
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-xl: var(--radius-xl);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  html { @apply h-full; }
  body { @apply h-full bg-background text-foreground; font-family: var(--font-ui); }
}
```

Every existing shadcn token name is preserved at the semantic tier — most existing themes need zero changes.

### Step 3 — Add the affordance mirror

Where the current theme-apply code lives (search for whatever sets `data-color-scheme` / theme name on `<html>` today), add the affordance mirror. New module:

```ts
// src/lib/theming/apply_affordances.ts
const SLOTS: ReadonlyArray<readonly [cssVar: string, attr: string]> = [
  ["--statusbar-shape",      "data-statusbar-shape"],
  ["--tab-active-indicator", "data-tab-indicator"],
  ["--sidebar-active-shape", "data-sidebar-active"],
];

export function apply_affordances(root: HTMLElement = document.documentElement): void {
  const cs = getComputedStyle(root);
  for (const [css_var, attr] of SLOTS) {
    const v = cs.getPropertyValue(css_var).trim().replace(/^"|"$/g, "");
    if (v) root.setAttribute(attr, v);
    else root.removeAttribute(attr);
  }
}
```

Call `apply_affordances()` from the same place that sets `data-theme` today, **after** the theme attribute is set (so `getComputedStyle` reads the new theme's values). One call per theme change.

### Step 4 — Component CSS rewiring

Audit Svelte components for direct Tier-2 references on surface-specific nodes. For each:

| Component                      | Replace                       | With                          |
| ------------------------------ | ----------------------------- | ----------------------------- |
| Editor wrapper                 | `var(--background)`           | `var(--editor-background)`    |
| Editor body text               | `var(--foreground)`           | `var(--editor-foreground)`    |
| Editor link / wikilink         | hard-coded blue / `--primary` | `var(--editor-link)`          |
| Editor `pre` / inline `code`   | `var(--muted)`                | `var(--editor-code-bg)`       |
| Editor selection               | `::selection { background: }` | `var(--editor-selection)`     |
| Tab active background          | `var(--background)`           | `var(--tab-active-bg)`        |
| Tab inactive background        | `var(--muted)`                | `var(--tab-inactive-bg)`      |
| Tab border                     | `var(--border)`               | `var(--tab-border)`           |
| Status bar bg/fg               | hard-coded                    | `var(--statusbar-bg/fg)`      |
| Sidebar (already correct)      | `var(--sidebar-*)`            | unchanged                     |

`activity_bar.svelte` already uses `--sidebar-*` and `--interactive` — no changes needed there.

### Step 5 — Reshape contract dispatch

Move the per-theme reshape rules out of theme files and into the relevant component's `<style>` block, keyed on the affordance attribute. Example for the status bar:

```svelte
<!-- src/lib/app/bootstrap/ui/status_bar.svelte -->
<style>
  .StatusBar { /* base styles using --statusbar-bg/--statusbar-fg */ }

  :global([data-statusbar-shape="transparent"]) .StatusBar {
    background: transparent;
    color: var(--foreground-secondary);
  }
  :global([data-statusbar-shape="segments"]) .StatusBar { gap: 0; padding: 0; }
  :global([data-statusbar-shape="segments"]) .StatusBar__group {
    padding: 0 var(--statusbar-segment-pad);
    border-left: 1px solid var(--statusbar-divider);
  }
  :global([data-statusbar-shape="segments"]) .StatusBar__group--git  { background: oklch(0.55 0.18 250); color: white; }
  :global([data-statusbar-shape="segments"]) .StatusBar__group--mode { background: oklch(0.65 0.18 30);  color: white; }
</style>
```

Same pattern for `data-tab-indicator` (in tabs component) and `data-sidebar-active` (in sidebar/tree-row component). Reference styling lives in `styles/shell.css` under the *StatusBar shape contract*, *Tab active-indicator contract*, and *Sidebar active-row shape contract* sections — port those rule blocks unchanged.

### Step 6 — Migrate the existing 20+ themes

For each theme in the existing `static/themes/*.css` (or wherever they live):

1. **Compatibility check** — token names already match shadcn. Most themes need zero rewrites.
2. **Set affordance flags** — pick one value per affordance slot. Defaults (`bar` / `underline` / `ribbon`) match today's behavior, so themes that don't declare anything keep working.
3. **Optionally adopt Tier-3 tokens** — themes that want a different editor or sidebar look (Brutalist, Neon, Glass) declare `--editor-*` / `--sidebar-*` overrides. Themes that don't, inherit from the semantic tier automatically.

A migration script over the theme directory can do (1) mechanically; (2) and (3) are per-theme judgement calls.

### Step 7 — Tweaks (density / radius / accent hue)

These are *orthogonal* to themes. Add to the existing settings panel:

- **Density** — write `data-density` on `<html>`. Values: `compact` (0.85×), `regular` (1×), `airy` (1.18×). Chrome heights scale; type sizes don't.
- **Radius** — write `--radius` inline on `<html>`. Values: `0px` / `6px` / `12px`.
- **Accent hue** — slider 0–360°. Rewrites `--interactive` / `--ring` / `--focus-ring` inline at constant L/C. Only meaningful for themes that use a chromatic accent (Carbide, Cockpit). Paper and Terminal ignore it.

All three persist via the existing per-vault settings store.

### Step 8 — Tests

Per `AGENTS.md` (BDD-style, deterministic, in top-level `tests/`):

- `apply_affordances` mirrors all three slots correctly given a stub `<html>` with `--statusbar-shape: "segments"` set inline.
- Empty/missing custom property → corresponding attribute is removed.
- Quoted and unquoted string values both parse (Tailwind sometimes strips quotes).
- Snapshot test: per theme × per scheme, the computed values of `--background`, `--foreground`, `--interactive`, `--statusbar-shape` match expected.

---

## Design tokens — full reference

All values live in `styles/tokens.css` (defaults) and `styles/themes.css` (per-theme overrides). The full enumeration with types, accepted values, and tier ownership is in `Token Spec.md`. Rather than duplicate it here, treat `Token Spec.md` as the canonical reference.

### Affordance slot values (closed sets)

- `--statusbar-shape`: `"bar"` · `"transparent"` · `"segments"`
- `--tab-active-indicator`: `"underline"` · `"border"` · `"fill"` · `"none"`
- `--sidebar-active-shape`: `"ribbon"` · `"fill"` · `"weight"` · `"invert"`
- `--heading-prefix-h1/2/3`: any string (`""` to disable)

Adding a new value is a deliberate, reviewed change — bump the spec, add the rule block in the relevant component's CSS, then themes can opt in.

---

## Validation

Per `AGENTS.md`, after code changes run:

```
pnpm check                          # Svelte/TypeScript
pnpm lint                           # oxlint + layering rules
pnpm test                           # Vitest
cd src-tauri && cargo check         # Rust
pnpm format                         # Prettier
```

The layering linter may complain if Tier-3 tokens reference Tier-1 directly — they should always go through Tier 2. Fix at the token definition, not by suppressing the lint.

---

## Open questions for the implementer

1. **Where does theme-apply currently live?** The mirror needs to hook in there; please find that module before scaffolding a new one.
2. **Per-vault vs global theme?** The current settings store seems per-vault. Tweaks (density/radius/accent) probably want to follow the same pattern.
3. **Plugins reading tokens** — the iframe-sandboxed plugin system probably consumes these CSS variables. Verify nothing in the plugin API surface relies on a Tier-2 token name that we're moving to Tier 3 (none should — semantic names are unchanged).

---

## Files

- `Token Spec.md` — canonical architecture spec, read first
- `styles/tokens.css` — port verbatim into `src/styles/tokens.css`
- `styles/themes.css` — port verbatim into `src/styles/themes.css`
- `styles/shell.css` — **reference only**; lift the contract rule blocks (StatusBar / Tab / Sidebar active-row sections) into the corresponding Svelte components' scoped styles
- `prototype/*` — interactive demo, not for shipping
