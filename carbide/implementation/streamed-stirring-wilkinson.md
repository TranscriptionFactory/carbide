# Theme Architecture Refactor + Fix Obsidian Light & Lattice Light

## Context

Two immediate bugs — missing Obsidian Light theme, Lattice Light poor contrast — exposed a deeper architectural problem: **800+ manual token assignments across 32 themes**, with most themes just remapping the same ~30 tokens with different hues. The current `token_overrides: Record<string, string>` is doing all the heavy lifting. Adding a new theme requires hand-writing 30-40 tokens. Light/dark pairs duplicate each other. Layout CSS hardcodes values that also exist in token_overrides. The v4 design vocabulary (`--glass`, `--fg-2`, `--accent-glow`) isn't integrated.

**Core insight:** Every theme is parameterized by (surface_hue, surface_chroma, accent_hue, accent_chroma, color_scheme, surface_style). A generator can derive 30+ tokens from these 6 parameters, reducing theme definitions from ~80 lines to ~15 lines.

## Architecture

### New Theme Fields

Add to `Theme` type:
```typescript
surface_hue: number;         // hue for neutrals (bg, card, sidebar, border)
surface_chroma: number;      // chroma for neutrals (0 = pure gray)
surface_style: "solid" | "glass" | "transparent";
```

Defaults: `surface_hue: 68, surface_chroma: 0.008, surface_style: "solid"` (matches current Nordic base).

### Expanded Palette Generator

`palette_generator.ts` currently generates 12 editor colors. Expand to generate **all ~30 UI tokens** from the parameters:

| Token | Light L | Dark L | Source |
|---|---|---|---|
| `--background` | 0.985 | 0.18 | surface |
| `--foreground` | 0.25 | 0.92 | surface |
| `--card` | 0.985 | 0.22 | surface (+ alpha if glass) |
| `--muted-foreground` | 0.50 | 0.58 | surface |
| `--border` | 0.92 | 0.31 | surface |
| `--sidebar` | 0.985 | 0.19 | surface |
| `--primary` | 0.48 | 0.68 | accent |
| `--interactive` | 0.48 | 0.68 | accent |
| ... | ... | ... | ... |

When `surface_style: "glass"`, card/sidebar/secondary get alpha channels (e.g., `oklch(0.22 0.02 275 / 0.55)`).

**Precedence in apply_theme():** `token_overrides` > generated tokens > design_tokens.css defaults. Existing user themes with manual overrides continue to work unchanged.

### V4 Tokens as CSS Aliases

Add to `design_tokens.css` (derived from base tokens, zero per-theme work):
```css
--fg-2: var(--muted-foreground);
--fg-3: var(--foreground-tertiary);
--glass: color-mix(in oklch, var(--card) 55%, transparent);
--glass-strong: var(--card);
--accent-glow: color-mix(in oklch, var(--primary) 30%, transparent);
--on-accent: var(--primary-foreground);
```

Layout CSS files reference these instead of hardcoding oklch values.

### ThemeBlueprint (Build-Time Convenience)

Compact definition format for builtins only:
```typescript
type ThemeBlueprint = {
  base_name: string;
  surface_hue: number;
  surface_chroma: number;
  accent_hue: number;
  accent_chroma: number;
  surface_style?: SurfaceStyle;
  layout_variant?: ThemeLayoutVariant;
  schemes?: "both" | "dark_only";  // default "both"
  // Typography + editor style overrides
  font_family_sans?: string;
  // Sparse structural-only overrides (radius, shadows, sizes)
  structural_overrides?: Record<string, string>;
  // Rare per-scheme color overrides
  color_overrides_light?: Record<string, string>;
  color_overrides_dark?: Record<string, string>;
};
```

`expand_blueprint()` → `[Theme, Theme]` (light+dark) or `[Theme]` (dark-only).

**Obsidian Dark after refactor (~15 lines instead of ~50):**
```typescript
const OBSIDIAN: ThemeBlueprint = {
  base_name: "Obsidian",
  surface_hue: 275,
  surface_chroma: 0.018,
  accent_hue: 285,
  accent_chroma: 0.19,
  surface_style: "glass",
  layout_variant: "obsidian",
  structural_overrides: {
    "--radius": "0.875rem",
  },
  color_overrides_dark: {
    "--accent": "oklch(0.78 0.2 325)",
  },
};
```

Generator produces all background/foreground/card/sidebar/border/interactive tokens. Obsidian Light comes free — just the light scheme of the same blueprint.

## Phased Implementation

### Phase 1: Add generator infrastructure (non-breaking)
**Files:** `theme.ts`, `palette_generator.ts`, `apply_theme.ts`

1. Add `surface_hue`, `surface_chroma`, `surface_style` to Theme type with defaults in SHARED_DEFAULTS
2. Write `generate_ui_tokens(surface_hue, surface_chroma, accent_hue, accent_chroma, scheme, style)` that produces the full token set
3. Update `apply_theme()` to merge generated tokens below token_overrides (overrides win)
4. Add migration in theme service to backfill new fields on existing user themes
5. **Test:** Existing themes look identical (generated tokens are shadowed by their token_overrides)

### Phase 2: Add V4 tokens to design_tokens.css
**Files:** `design_tokens.css`

1. Add `--fg-2`, `--fg-3`, `--glass`, `--glass-strong`, `--accent-glow`, `--on-accent` as CSS aliases
2. No visual change — these are new tokens that nothing references yet

### Phase 3: Convert builtins to blueprints
**Files:** `theme.ts` (this is the big diff — 1400→~400 lines)

1. Create `ThemeBlueprint` type and `expand_blueprint()` function
2. Convert all 33 themes to blueprints, one at a time
3. For each theme: extract parameters, run generator, diff output against current hand-written tokens, adjust lightness formula constants until output matches
4. `BUILTIN_THEMES` becomes computed from blueprints
5. **Obsidian Light is just Obsidian blueprint with `schemes: "both"`**
6. **Lattice Light is automatically fixed** — generator uses hue 190 consistently for all tokens

### Phase 4: Migrate layout CSS to use tokens
**Files:** All 20 `theme-*.css` files

1. Replace hardcoded oklch values with `var(--glass)`, `var(--accent-glow)`, `var(--background)` etc.
2. `theme-obsidian.css`: glow gradient uses `var(--accent-glow)`, grain uses standard token, glass panels use `var(--glass)`
3. Add light-mode adaptations to obsidian CSS (lighter glow, darker grain dots)

### Phase 5: Settings UI update
**Files:** Settings components

1. Add surface hue/chroma sliders to theme editor
2. Add surface_style dropdown
3. token_overrides panel stays for power users

## Verification

After each phase:
- `pnpm check` — type checking
- `pnpm lint` — linting
- `pnpm test` — existing theme tests pass
- `pnpm format` — formatting
- Visual regression: screenshot each theme before/after, diff (manual)

## Critical Files

| File | Change |
|---|---|
| `src/lib/shared/types/theme.ts` | Theme type, blueprints, expand_blueprint(), all builtins |
| `src/lib/shared/utils/palette_generator.ts` | Expand from 12 to ~45 token generation |
| `src/lib/shared/utils/apply_theme.ts` | Merge generated tokens below overrides |
| `src/styles/design_tokens.css` | V4 token aliases, surface-hue/chroma vars |
| `src/styles/theme-obsidian.css` | Replace hardcoded values with token refs, add light mode |
| `src/styles/theme-*.css` (all 20) | Same pattern as obsidian |
| `tests/unit/utils/apply_theme.test.ts` | Test token precedence, generator output |
