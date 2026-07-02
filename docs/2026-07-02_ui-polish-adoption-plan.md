# UI Polish Adoption Plan — Carbide

**Date:** 2026-07-02
**Status:** Proposed
**Scope:** Presentation layer only (tokens, palette, motion, typography, Tauri window chrome, two UI patterns). No editor/backend/architecture changes.

---

## 1. Decision & Rationale

**Decision: Do NOT re-port Carbide onto open-knowledge (OK) or tolaria. Adopt their CSS values and two UI patterns into Carbide's existing shadcn-svelte + Tailwind v4 stack; prune Carbide's theme catalog.**

### Why not re-port

- OK and tolaria are **both React**. Carbide is **Svelte 5 + Tauri**. A "port onto" either means rebuilding their UI in Svelte _anyway_, while discarding Carbide's crown jewels.
- All three apps already share the **same UI substrate**: Tailwind v4 (CSS-first `@theme`), shadcn (radix/bits-ui), CodeMirror-6, a ProseMirror-family editor. The rivals' advantage is therefore **not architectural** — it is curated CSS values + restraint + a couple of interaction patterns, nearly all framework-agnostic CSS that drops into Carbide unchanged.

### Carbide crown jewels (keep unconditionally — Svelte/Rust-locked, expensive, better than rivals')

- **ProseMirror editor + ~90-plugin ecosystem** (`src/lib/features/editor/`): slash menu, `@`-palette, tables w/ edge controls, callouts, math (KaTeX), Shiki code blocks, embeds, CodeMirror-6 source-mode bridged w/ full LSP, Yjs CRDT collab. (OK uses TipTap, tolaria uses BlockNote — porting = rebuilding our editor.)
- **Rust backend + hexagonal ports architecture** (`src-tauri/src/features/`, 24 modules). Neither rival has this.
- **OKLCH token _engine_** (`src/styles/tokens.css`, `design_tokens.css`, `apply_theme.ts`, `theme.ts`) — keep the engine, cut the catalog.
- PixiJS graph view, multi-format viewers, MCP/AI plumbing.

### Root problem

Carbide's engine already out-classes both rivals; it wears the wrong clothes. The polish gap is:

1. **Palette** — cold/ad-hoc vs rivals' curated warm neutrals / single-accent OKLCH ramp.
2. **Motion** — undifferentiated 151-line `motion.css` vs OK's tuned+guarded keyframes / tolaria's disciplined restraint.
3. **Typography** — no centralized editor type spec vs tolaria's `theme.json`.
4. **Tauri chrome** — no native-feel titlebar/traffic-light handling (tolaria has it; directly relevant since we're Tauri too).
5. **Theme sprawl** — 21 theme CSS files × 16 layout variants × density × surface_style × scheme = untestable combinatorial space, dilutes polish, violates our own AGENTS.md ("avoid over-engineering / speculative future-proofing").

---

## 2. Source references

| Adopt from                                                                                   | File(s)                                                                                                                                  |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Warm-neutral palette, 2-layer semantic tokens, shadcn alias map                              | `tolaria/src/index.css`                                                                                                                  |
| Editor typography-as-data + flatten transform                                                | `tolaria/src/theme.json`, `tolaria/src/hooks/useTheme.ts`                                                                                |
| Tauri window chrome (Overlay titlebar, traffic-light pos, bg-matched-to-sidebar)             | `tolaria/src-tauri/tauri.conf.json`, `tolaria/src/utils/platform.ts`, `tolaria/src/components/LinuxTitlebar.tsx`, `tolaria/src/main.tsx` |
| Motion CSS (easing tokens, agent-flash/breathing, reduced-motion/-transparency guards)       | `open-knowledge/packages/app/src/globals.css` (~`:111-352`, keyframes)                                                                   |
| Slash-menu live-preview pattern (two-pane list + `render()` + focus-steal prevention + ARIA) | `open-knowledge/packages/app/src/editor/slash-command/SlashCommandMenu.tsx`, `items.tsx`                                                 |

**Carbide targets:** `src/styles/` (`tokens.css`, `design_tokens.css`, `themes.css`, `motion.css`, `editor.css`), `src/lib/shared/types/theme.ts`, `src/lib/shared/utils/apply_theme.ts`, `src-tauri/tauri.conf.json`, `src/lib/features/editor/adapters/slash_command_*`, `src/lib/app/bootstrap/ui/lattice_title_bar.svelte`.

---

## 3. Phased plan

> Ordered by value × portability. Phases 1–4 are drop-in CSS/config; 5–6 reimplement a pattern in Svelte; 7 is deletion. Commit at each phase boundary. Consult `docs/architecture.md` decision tree before Phases 5–7.

### Phase 1 — Curated palette (highest polish-per-effort)

Replace Carbide's palette values with tolaria's warm-neutral system, expressed through Carbide's existing OKLCH token tiers (don't import raw hex blindly — map to Tier 2 semantic tokens).

- Warm surfaces (`--surface-app/-sidebar/-panel/-card/-popover`), 6-step warm text ramp, 10 accent roles each w/ `base`/`-light`/`-bg`/`-hover`, interaction-state tokens (`--state-hover/-selected/-focus-ring`).
- Both light + dark. Dark = warm near-black, not slate.
- **Dependency (found 2026-07-02):** `bases`/`tags` panels bypass the token system — they hardcode raw Tailwind zinc (`bg-zinc-100 dark:bg-zinc-800`, `bg-white dark:bg-zinc-900`, `border-zinc-200`, e.g. `bases_kanban.svelte`, `bases_gallery.svelte`, `bases_calendar.svelte`, `bases_panel.svelte`). These surfaces will NOT pick up the new palette (or any theme) until swept to semantic utilities (`bg-card/-muted`, `border-border`, `bg-popover`). Do this zinc→token sweep as the first step of Phase 1; violates AGENTS.md "always use shadcn semantic utilities."
- **verify:** app renders in light + dark; **no `zinc-`/hardcoded-hex left in `bases`/`tags` UI** (grep clean); `pnpm check` clean; spot-check editor, sidebar, dialogs, statusbar, bases-kanban/gallery/calendar for contrast.
- **commit:** `feat(theme): adopt warm-neutral curated palette; sweep bases/tags to semantic tokens`

### Phase 2 — Tauri window chrome

Port tolaria's `tauri.conf.json` window treatment: `titleBarStyle:"Overlay"`, `hiddenTitle:true`, `trafficLightPosition`, `backgroundColor` matched to sidebar surface (kills load-flash). Pure Rust/JSON.

- **Also (#1) — native window material:** Carbide has _CSS_ glass (`surface_style: glass` in `theme.ts`) but no OS material behind it, so glass themes float on opaque windows. Add native vibrancy/blur via Tauri `WindowEffects` (macOS `NSVisualEffect` / Windows acrylic-mica) + a `data-tauri-material` class so only outer-canvas surfaces go alpha-aware (OK's `electron-mode` pattern, mapped to Tauri). Gate behind glass/transparent surface styles only.
- **verify:** `cd src-tauri && cargo check`; launch app; confirm no white load-flash, traffic lights positioned correctly on macOS, glass themes show OS material (macOS/Windows), opaque themes unaffected.
- **commit:** `feat(window): overlay titlebar + sidebar-matched bg + native vibrancy for glass themes`

### Phase 3 — Motion system

Bring OK's easing tokens (`--ease-out-strong`, `--ease-in-out-strong`), the `agent-flash`/`agent-breathing` keyframes for AI-edit signaling, and — critically — the `prefers-reduced-motion` + `prefers-reduced-transparency` guard blocks into `src/styles/motion.css`. Prune undifferentiated existing rules.

- Wire `agent-flash`/`breathing` to the existing AI inline/assistant edit states (`features/ai/`).
- **verify:** animations play; reduced-motion OS setting disables them; `pnpm check`.
- **commit:** `feat(motion): tuned easing + AI-state animations w/ a11y guards`

### Phase 4 — Editor typography-as-data

Adopt tolaria's `theme.json` pattern: a single JSON spec (heading weights h1 700/h2 600, `-0.5` letter-spacing, line-height, reading measure ~820–1024px, Inter + `optimizeLegibility`) flattened to CSS vars consumed by `editor.css`. ~30-line flatten fn in TS.

- Reduces `editor.css` (3663 lines) reliance on scattered raw values.
- **verify:** editor typography matches spec; `pnpm test` editor suite; `pnpm check`.
- **commit:** `feat(editor): centralize typography spec as data`

### Phase 5 — Slash-menu live-preview pattern

Carbide already has slash menu + `slash_command_previews`. Graft OK's two-pane structure: `role="listbox"` items left, right-side `<aside>` rendering the selected item's live preview (Svelte snippet in place of React `render()`), keyboard + hover selection, `onMouseDown preventDefault` focus-steal prevention, full ARIA (`listbox`/`option`/`aria-activedescendant`).

- **verify:** slash menu shows live preview pane; editor keeps focus; keyboard nav + `scrollIntoView`; add/extend component test.
- **commit:** `feat(editor): two-pane live-preview slash menu`

### Phase 6 — Platform-aware custom titlebar

Port tolaria's platform logic (`shouldUseCustomWindowChrome` → native traffic-lights on macOS, custom titlebar on Linux/Windows). Logic is framework-neutral TS; rebuild the bar in Svelte (extend/replace `lattice_title_bar.svelte`). Drag region w/ `data-no-drag` zones, min/max/restore/close, maximized-state observer.

- **verify:** run on Linux (custom bar) + macOS (native lights, safe padding); window controls work.
- **commit:** `feat(window): platform-aware custom titlebar`

### Phase 7 — Prune theme sprawl (deletion, highest structural impact)

Cut 21 theme CSS files + 24 `BUILTIN_THEMES` + 16 layout variants down to a curated **2–4 themes** (e.g. warm-light, warm-dark, + 1–2 signature). Keep the OKLCH engine and token tiers intact. Remove now-dead layout-variant branches in `workspace_layout.svelte`, `apply_theme.ts`, `theme.ts`, `themes.css`, and the per-theme CSS files.

- **Consult `docs/architecture.md` decision tree first** — this touches core theme types.
- **verify:** theme gallery shows only curated set; no dangling `data-layout-variant`/`data-theme` references; `pnpm check` + `pnpm test` + `cargo check` clean; theme-authoring UI still functions for custom themes.
- **commit:** `refactor(theme): prune theme catalog to curated set, keep OKLCH engine`

---

### Phase 8 — Global polish bundle (#2–#5, all CSS-only, cheap)

Four small, framework-agnostic additions from the component-gap review (2026-07-02). Can ship as one commit or fold into earlier phases.

- **(#2) Global affordance base rule.** `cursor:pointer` currently only appears scattered in `editor.css`; there's no app-wide rule. Add a global base: `button:not(:disabled), [role="button"], [role="menuitem"], [role="option"] { cursor: pointer }` + a consistent `:focus-visible` ring token app-wide (tolaria `index.css:426-435`, OK `focus-visible:ring-3 ring-ring/50`). Target: a base layer in `src/styles/` (e.g. `component_overrides.css` or `tokens.css`).
- **(#3) Floating secondary-window chrome.** Carbide already ships secondary windows (`viewer_shell`, `WebviewWindow` adapter) but lacks polished child-window treatment. Add tolaria's rounded-corner + layered-shadow CSS (`ai-workspace-native-window`: `border-radius:12px` + `0 8px 18px…, 0 1px 3px…`, heavier in dark) to the viewer/child-window root.
- **(#4) Primary-hue-tracked selection halo.** Derive selection/hover alphas from the accent hue so highlights read as one family (OK `--selection-soft: oklch(.66 .18 259 / .18)`, dark `.32` alpha). Trivial via Carbide's existing OKLCH `--accent-hue`/`--accent-chroma` — compute `--selection-soft` in `design_tokens.css`.
- **(#5) Reserved AI-state accent.** Adopt OK's convention: one dedicated accent (terracotta `#d97757`) used _only_ for AI edit signaling — wire it to the Phase-3 `agent-flash`/`breathing` animations. A design convention + one token, not a component.
- **verify:** interactive elements show pointer + focus ring globally; open a viewer/child window → rounded+shadowed; text selection tint matches accent hue in light+dark; AI-edit flash uses the reserved accent; `pnpm check`.
- **commit:** `feat(theme): global affordance rule, child-window chrome, accent-tracked selection, AI-state accent`

> **Optional follow-up (unranked):** semantic per-tag/type/status accent roles (tolaria `typeColors.ts` — `{key,label,css,cssLight}` per role, consumed by an accent-picker). Only worth building _after_ the Phase-1 zinc→token sweep, since bases/tags currently have no role-color system at all. Defer unless tag/type coloring becomes a product requirement.

## 4. Cross-cutting requirements

- Branch: `feat/ui-polish-adoption` (spans many files, multiple subtasks).
- After each code phase run: `pnpm check`, `pnpm lint`, `pnpm test`, `cd src-tauri && cargo check`, `pnpm format`.
- Invoke **code-simplifier** subagent after Phases 3–7 (major style/structure changes) w/ full context.
- Use shadcn semantic utilities; custom utilities only where shadcn lacks a token (per AGENTS.md).
- Add/extend tests in top-level `tests/` for Phases 5 (slash preview) and 4 (flatten fn).
- Update this document as phases complete.

## 5. Explicitly out of scope

- Editor engine, ProseMirror plugins, Rust backend, ports architecture, Yjs, graph, viewers, MCP/AI logic — untouched.
- Adopting React components verbatim — never; only patterns/values port.
- Icon library swap — optional later (tolaria uses Phosphor, ships `phosphor-svelte`); Carbide stays on Lucide unless a gap appears.

## 6. Suggested sequencing

Fast first win: **Phase 1** (palette + the required bases/tags zinc→token sweep) is a high-impact standalone commit — note it now has a hard dependency, so it's slightly larger than a pure value-swap. Phases 1→2→3 give ~80% of the visible polish in days. **Phase 8** (global affordance rule, child-window chrome, accent-tracked selection, AI accent) is CSS-only and can land anytime — cheapest polish-per-line; #4/#5 pair naturally with Phase 3. Phase 7 (prune) is the biggest _structural_ improvement and should follow once curated palette proves the direction.
