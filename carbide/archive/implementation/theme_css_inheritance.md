# Theme CSS Inheritance — Drastically Different Themes Without Token Bloat

**Date:** 2026-04-25
**Depends on:** Phase 4 completion (theme blueprint generator, `bb925d7c`)

## Problem

The design files (v2 Lattice, v3 Pulse, v4 Obsidian) envision themes with rich visual vocabularies — glass tiers, accent glows, grain textures, semantic status colors. The parametric generator (`generate_ui_tokens`) produces ~30 core tokens consumed by 50-90 files across the app. The v4-style tokens (`--glass`, `--accent-glow`, etc.) are consumed by only 2 layout CSS files (10 occurrences total).

Adding ~15 tokens to the generator would mean every theme pays for tokens only 1-2 layout variants consume. That's bloat.

## Approach: CSS-level derivation from exported primitives

The pattern already exists: `design_tokens.css` derives an entire teal scale from `var(--accent-hue)` and `var(--accent-chroma)`. Extend this pattern so layout variant CSS can derive arbitrary tokens from the parametric primitives without touching the generator.

**Principle:** The generator exports raw building blocks. CSS inherits and composes. Layout variants derive what they need locally. Themes that don't use a variant pay zero cost.

## Current State

### Primitives exported by `apply_theme.ts`
- `--accent-hue` ✅
- `--accent-chroma` ✅
- `--surface-hue` ❌ (not exported — passed to generator but not written as a CSS variable)
- `--surface-chroma` ❌ (same)

### V4 aliases in `design_tokens.css` (lines 124-129)
- `--fg-2`, `--fg-3` — foreground tiers
- `--glass`, `--glass-strong` — glass surface tiers (derived from `--card`)
- `--accent-glow` — accent with alpha (derived from `--primary`)
- `--on-accent` — contrast on accent (alias for `--primary-foreground`)

### Gap
- No `--glass-deep`, `--edge`, `--edge-strong`, `--hover` aliases
- No semantic status colors (`--status-modified`, `--status-added`, `--status-deleted`)
- No `--bg-deep` for layered depth
- Surface primitives not available in CSS, so variant CSS can't derive surface-colored tokens
- No `font_family_serif` field (Monolith uses `token_overrides` workaround)

## Implementation

### Step 1: Export surface primitives from `apply_theme.ts`

Add `--surface-hue` and `--surface-chroma` to `build_token_entries()`, alongside the existing accent primitives.

```typescript
// apply_theme.ts — build_token_entries()
["--accent-hue", String(theme.accent_hue)],
["--accent-chroma", String(theme.accent_chroma)],
["--surface-hue", String(theme.surface_hue)],      // NEW
["--surface-chroma", String(theme.surface_chroma)], // NEW
```

This is the only change to the TypeScript pipeline. Two lines added. Zero new generated tokens.

**Test:** Add a case to `apply_theme.test.ts` verifying `--surface-hue` and `--surface-chroma` appear in the applied properties.

### Step 2: Expand `design_tokens.css` alias block

Add derived aliases that any layout variant or component *may* use. These are pure CSS derivations from existing generated tokens — no JS changes.

```css
/* Existing */
--fg-2: var(--muted-foreground);
--fg-3: var(--foreground-tertiary);
--glass: color-mix(in oklch, var(--card) 55%, transparent);
--glass-strong: var(--card);
--accent-glow: color-mix(in oklch, var(--primary) 30%, transparent);
--on-accent: var(--primary-foreground);

/* New — glass + depth tiers */
--glass-deep: color-mix(in oklch, var(--card) 35%, transparent);
--bg-deep: color-mix(in oklch, var(--background) 70%, black);

/* New — edge tiers (border variants) */
--edge: color-mix(in oklch, var(--border) 50%, transparent);
--edge-strong: var(--border);

/* New — interaction states */
--hover: color-mix(in oklch, var(--muted) 50%, transparent);

/* New — semantic status (fixed hues, scheme-adaptive lightness) */
--status-modified: oklch(0.75 0.15 70);   /* amber */
--status-added: oklch(0.72 0.17 155);     /* green */
--status-deleted: oklch(0.65 0.2 25);     /* red */
--status-dirty: oklch(0.75 0.15 70);      /* alias for modified */
```

Dark-mode overrides in the existing `[data-color-scheme="dark"]` block:

```css
--bg-deep: color-mix(in oklch, var(--background) 60%, black);
--status-modified: oklch(0.7 0.14 70);
--status-added: oklch(0.65 0.15 155);
--status-deleted: oklch(0.6 0.18 25);
--status-dirty: oklch(0.7 0.14 70);
```

**Bloat analysis:** These are CSS custom properties in `:root`, not JS-generated tokens. They cost ~zero runtime — the browser only resolves them when actually referenced. Unreferenced custom properties don't trigger style recalculation. This is fundamentally different from adding them to `generate_ui_tokens()` which would compute OKLCH strings in JS for every theme application.

### Step 3: Layout variant CSS can now derive locally

With surface primitives available, variant CSS can create tokens scoped to their selector. Example for a hypothetical "Aurora" variant:

```css
[data-layout-variant="aurora"] {
  --aurora-glow-1: oklch(0.3 var(--accent-chroma) var(--accent-hue) / 0.25);
  --aurora-glow-2: oklch(0.25 var(--surface-chroma) var(--surface-hue) / 0.15);
  --aurora-rim: oklch(0.5 calc(var(--accent-chroma) * 1.5) var(--accent-hue) / 0.6);
}
```

These are scoped — they only exist within that variant. Other themes don't see them.

### Step 4: Migrate hardcoded colors in existing components to status tokens

Grep for hardcoded git status colors in components and replace with the new semantic tokens.

Candidates (verify before changing):
- `change_card.svelte` — likely uses hardcoded amber/green/red for M/A/D indicators
- `checkpoint_history.svelte` — status dot colors
- `source_control_panel.svelte` — status badges
- `git_diff_view.svelte` — addition/deletion line backgrounds

This is optional and can be a separate follow-up. The aliases are valuable even before migration — they provide a vocabulary for new code.

### Step 5 (optional): Add `font_family_serif` to Theme type

Currently Monolith injects a serif font via `token_overrides: { "--font-serif": "..." }`. Making it a first-class field:

```typescript
// theme.ts
font_family_serif: string; // default: "" (no serif)
```

```typescript
// apply_theme.ts
if (theme.font_family_serif) {
  entries.push(["--font-serif", resolve_font_stack(theme.font_family_serif, "serif")]);
}
```

This lets the theme editor UI expose it and blueprints set it cleanly. Low priority — the token_overrides approach works fine.

## Summary of changes

| File | Change | Lines |
|---|---|---|
| `apply_theme.ts` | Export `--surface-hue`, `--surface-chroma` | +2 |
| `design_tokens.css` | Add ~8 alias tokens (glass-deep, bg-deep, edge, hover, status-*) | +16 (light + dark blocks) |
| `apply_theme.test.ts` | Verify surface primitives in output | +5 |
| Component migration (Step 4) | Replace hardcoded status colors | ~10-20 lines across 4-5 files |

## What this enables

A new "drastically different" theme becomes a blueprint + a layout CSS file:

1. **Blueprint** sets parametric values (hues, chromas, spacing, fonts, surface_style)
2. **Layout CSS** derives variant-specific tokens from the 4 primitives (`--accent-hue`, `--accent-chroma`, `--surface-hue`, `--surface-chroma`) and the global aliases
3. **No hardcoded colors** — changing accent hue automatically transforms glows, edges, status indicators
4. **Zero bloat** — variant-specific tokens are scoped to their CSS selector, aliases are lazy-resolved by the browser

## What this does NOT do

- Does not change the generator or add JS-computed tokens
- Does not add new fields to `ThemeBlueprint` (except optionally `font_family_serif`)
- Does not change the `expand_blueprint` contract
- Does not affect the theme editor UI (future phase 5 concern)
