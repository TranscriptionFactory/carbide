# Theme Blueprint Refactor — Phase 4 Continuation Plan

## Branch: `feat/theme-blueprint-generator`

## Completed (Phases 1-4)
- **Phase 1**: `generate_ui_tokens()` function that derives ~30 UI tokens from 6 params (surface_hue, surface_chroma, accent_hue, accent_chroma, scheme, style). Integrated into `apply_theme()` pipeline. Migration added for persisted user themes. Tests written and passing.
- **Phase 2**: V4 CSS token aliases added to `design_tokens.css`: `--fg-2`, `--fg-3`, `--glass`, `--glass-strong`, `--accent-glow`, `--on-accent`.
- **Phase 3**: All 21 theme families (37 themes) converted from individual `Theme` consts to `ThemeBlueprint` objects + `expand_blueprint()`. Obsidian now generates a Light variant. Net -127 lines.
- **Phase 4**: Migrated layout CSS to token references. Details below.

### Phase 4 — Migrate Layout CSS to Token References ✅

#### 4a. Obsidian CSS (`src/styles/theme-obsidian.css`) ✅
Replaced all 6 hardcoded oklch values with generated token refs:
- `oklch(0.22 0.02 275 / 0.55)` → `var(--glass)` (sidebar, tabbar, context rail backgrounds)
- `oklch(0.17 0.018 275 / 0.7)` → `var(--glass-strong)` (activity bar, status bar)
- `oklch(0.13 0.018 275)` in gradient → `var(--background)`
- `oklch(0.22 0.08 285 / 0.5)` in gradient → `var(--accent-glow)`
- `oklch(0.18 0.06 310 / 0.4)` in gradient → `color-mix(in oklch, var(--accent-glow) 80%, transparent)`
- `oklch(1 0 0 / 0.04)` grain dots → `color-mix(in oklch, var(--foreground) 4%, transparent)`

Added light-mode block with subtler glow (50%/30% accent-glow) and darker grain dots (6% foreground).

#### 4b. Other theme CSS files ✅
Audited all 19 remaining files. Most already used token refs or defined tokens:
- **theme-glass.css**: Replaced `rgba(255,255,255,0.05)` and `rgba(0,0,0,0.2)` with `color-mix(in oklch, var(--foreground) 5%/20%, transparent)`
- **theme-neon.css**: Replaced hardcoded `oklch(0.72 0.2 300 / 40%)` box-shadow with `var(--accent-glow)`
- **17 files unchanged**: Layout files (cockpit, command-deck, dashboard, grounded-heavy, hud, lattice, monolith, spotlight, theater, triptych, workbench, zen-deck) already used token refs. Color-definition files (brutalist, dense, floating, linear, paper) define tokens in `:root`/`[data-color-scheme="dark"]` blocks — no migration needed.

#### 4c. Verification ✅
- `pnpm check` — 0 errors
- `pnpm test` — 3498 tests passing (327 files)
- `pnpm format` — clean
- Committed as `bb925d7c`

### Available V4 Token Aliases (from Phase 2)
```css
--fg-2: var(--muted-foreground);
--fg-3: var(--foreground-tertiary);
--glass: color-mix(in oklch, var(--card) 55%, transparent);
--glass-strong: var(--card);
--accent-glow: color-mix(in oklch, var(--primary) 30%, transparent);
--on-accent: var(--primary-foreground);
```

Plus all standard generated tokens: `--background`, `--foreground`, `--card`, `--sidebar`, `--border`, `--primary`, `--muted`, `--secondary`, `--accent-hover`, `--border-strong`, `--border-subtle`, `--background-surface-2`, `--background-surface-3`, etc.

## Phase 5 (deferred, not in this PR)
Surface hue/chroma sliders and surface_style dropdown in theme editor settings UI.
