# UI Redesign Concepts — Dramatic Departures

**Date:** 2026-06-10
**Status:** Exploration / discussion. No decision made.
**Scope sought:** Full reimagining (new layout paradigm *and* new visual identity). Treat the current UI as throwaway.

---

## Starting point: what Carbide looks like today

A VS Code / Obsidian-shaped IDE:

- Custom title bar (`LatticeTitleBar`)
- 44px vertical activity bar (Files, Search, Git, Graph, Tasks, Tags, …)
- Resizable left sidebar (file tree + feature panels)
- Tabbed editor over a Milkdown markdown surface
- Bottom panel (terminal)
- Right context rail (backlinks / links)
- Status bar
- Neutral & minimal, teal accent, shadcn-svelte tokens, BEM, Nordic Light/Dark themes

Competent, but reads as a developer-flavored markdown app indistinguishable from peers.

---

## Three complete concepts

Each marries a paradigm + a visual language into one coherent vision, and maps to a candidate product identity. Deliberately placed at the corners so the pull is legible. Each promotes something **already built** in Carbide to centerpiece.

---

### Concept A — "Atelier" · the calm writing instrument

**Thesis:** Carbide is a place to write and think in prose. Everything that isn't your words is summoned, never resident.

**Launch:** no chrome. Warm off-white (dark mode: warm charcoal, not blue-black) full-bleed page, one centered ~68ch measure column, a real reading serif, a blinking cursor. No activity bar, tree, tabs, or status bar.

**Navigation model:** the omnibar becomes the operating system. `⌘K` for anything — open, search, link, run command, switch vault. Backlinks / outline / git peek in from screen edges on hover, then retract. Multiple open docs live as a quiet breadcrumb trail, not tabs.

**Visual language:** paper texture, ink accent (deep indigo or sepia — no teal), generous vertical rhythm, hairline rules instead of borders, near-zero shadows. Monospace appears only inside code blocks and the terminal.

```
┌──────────────────────────────────────────────────────┐
│                                                        │
│              On the Texture of Attention               │
│                                                        │
│        The morning began before I had decided          │
│        to begin it. There is a kind of writing         │
│        that happens at the edge of the cursor,         │
│        where the █                                      │
│                                                        │
│                                    ·  ·  ·  ⌘K          │
└──────────────────────────────────────────────────────┘
   (edges reveal backlinks / outline / git on hover)
```

- **Dies:** activity bar, persistent sidebar, tab bar, status bar.
- **Survives but hidden:** terminal, git, LSP, plugins, graph — all summoned.
- **Promotes:** the omnibar.
- **Competes with:** Bear / iA Writer / Ulysses.
- **Build cost:** low–moderate. **Risk:** safest.

---

### Concept B — "Forge" · the power-user knowledge tool

**Thesis:** Carbide is a fast, dense, keyboard-first traversal engine over a linked corpus. No mouse required, ever.

**Launch:** a quick-switcher front-and-center over a tiled workspace. Navigation is Miller columns / sliding panes — following a link slides a new pane in to the right; the column trail is your history. No tabs. Panes tile and split via keyboard (`⌘\`, vim-style focus motion — vim-nav already ships).

**Navigation model:** command palette + modal keys are primary. Everything is a verb. A persistent thin left gutter shows only single-char mode indicators. Terminal and LSP are first-class citizens, not bottom-drawer afterthoughts.

**Visual language:** brutalist-functional. Monospace UI chrome, 1px hard borders, zero rounded corners, no shadows, dense 24px rows, sharp high-contrast accent (acid green or amber). Reads like Helix/Zed grew a markdown brain.

```
┌─┬───────────────┬───────────────┬───────────────┐
│▟│ index.md      │ attention.md  │ ⟶ sources.md  │
│ │───────────────│───────────────│───────────────│
│N│ # Index       │ ## Attention  │ - James 1890  │
│G│ - [[attentio… │ links here →  │ - Simone Weil │
│ │ - [[sources]] │ backlinks: 4  │ █             │
│ │               │               │               │
│:│ NORMAL  vault/notes  4 panes  ⎇ main*  2↑     │
└─┴───────────────┴───────────────┴───────────────┘
   trail: index → attention → sources   (←/→ to walk)
```

- **Dies:** activity bar, tab bar, the single-editor + side-panels frame.
- **Promotes:** links/backlinks become the navigation substrate; terminal/git/LSP go first-class; vim-nav.
- **Competes with:** Obsidian power-users / Zed / Logseq.
- **Build cost:** moderate–high. **Risk:** medium.

---

### Concept C — "Field" · the spatial thinking canvas

**Thesis:** Carbide is where ideas live in space. The graph isn't a feature — it's the home screen.

**Launch:** an infinite, zoomable canvas. Notes are cards; clusters are topics; edges are links you can see and draw. Zoom out = the whole knowledge map; zoom into a card = it expands into the full Milkdown editor in place (semantic zoom). The "file tree" is just a searchable spotlight you rarely need.

**Navigation model:** pan/zoom + search-to-fly-to. Editing happens on the canvas (a card grows to fill view); pin several cards side by side as a working set. Spatial memory replaces folder memory.

**Visual language:** soft-glass / depth. Cards are floating rounded surfaces with subtle blur and elevation over a textured canvas; the command bar and tool islands float. Color encodes (tag → hue, recency → saturation), not just decorates.

```
        ┌─ attention ─┐         ┌─ sources ─┐
        │ James 1890… │━━━━━━━━━│ • Weil    │
        │ ░░░░░░░░     │         │ • James   │
        └─────────────┘         └───────────┘
               ┃                      ┃
        ┌─ index ─┐    ╭───────────────────╮
        │ # Home  │    │   ⌖  search / ⌘K  │
        │ ░░░░    │    ╰───────────────────╯
        └─────────┘
   (scroll = pan · ⌘scroll = zoom · dbl-click = expand)
```

- **Dies:** tree, tabs, activity bar, the document-list mental model.
- **Promotes:** graph + canvas (both already in the codebase) fuse into the core.
- **Competes with:** Heptabase / Muse / tldraw.
- **Build cost:** high. **Risk:** boldest.

---

## Comparison

| | **A · Atelier** | **B · Forge** | **C · Field** |
|---|---|---|---|
| Feels like | a notebook | a cockpit | a workshop wall |
| Primary input | typing prose | keyboard verbs | pan/zoom |
| Navigation | summon (⌘K) | column trail | spatial memory |
| Best for | drafting, long-form | research, traversal | synthesis, mapping |
| Build cost | low–moderate | moderate–high | high |
| Risk | safest | medium | boldest |
| Reuses most | editor, omnibar | links, vim-nav, terminal | graph, canvas |

Each concept promotes a different already-built capability to centerpiece — so none is a from-scratch fantasy; each is a re-weighting of existing Carbide strengths.

---

## Notes toward a decision

- The corners exist to make the pull legible. The real product is likely a **hybrid**, not a pure corner — e.g. Atelier's calm default with Forge's column-traversal available on keypress ("calm by default, powerful on keypress").
- Pick the corner that triggers "*yes, that's what Carbide is*" first; blend after.
- **Open question:** product identity is still undecided (calm writing instrument vs. power-user knowledge tool vs. spatial thinking canvas).

## Next step

Take the chosen corner and develop it into a screen-by-screen spec (launch, editing, search, settings) with tighter mockups, then identify which current components survive / change / die against `docs/architecture.md`.

---

## Appendix — à-la-carte departures considered

Visual-only (keep IDE bones): cozy/paper, brutalist terminal-native, floating-island soft-glass.
Paradigm-only: spatial canvas, zero-chrome prose room, miller-column sliding panes, dashboard "Today" home base, outliner-native blocks.
The three concepts above are coherent pairings drawn from this set.

---

# Cross-Evaluation — Concepts vs. DeepSeek's Ten

Combines this document's three concepts (A · Atelier, B · Forge, C · Field) with the ten
seeds in `2026-06-10_ui_design_departures_deepseek.md`, evaluated together by priority and impact.

## Overlap map

| This doc's concept | DeepSeek equivalent | Note |
|---|---|---|
| **C · Field** (spatial canvas + glass) | **#1 Infinite Canvas** | Same idea; Field adds semantic zoom + a visual language. |
| **A · Atelier** (zero-chrome calm) | **#8 Refine mode**, **#10 Notebook** (visually) | Atelier ≈ the calm half of #8; #10 is its skeuomorphic extreme. |
| **B · Forge** (columns + brutalist) | *(none)* | Power-user keyboard tiling is unique to this doc. |

DeepSeek's genuinely new contributions: #2 AI-first, #5 Timeline/Journal, #4 Card grid,
#3 Outliner, #9 Block-ref, #6 Ambient HUD, #7 Radial, #8 Dual-mode structure.

## The layer separation (key insight)

The ideas operate at **four different layers** — you can mix one from each; they are not
all mutually-exclusive competitors. Ranking them on one flat list is a category error.

1. **Visual identity** (cheap, theme-level, swappable): paper, brutalist, glass, skeuomorphic notebook.
2. **Navigation paradigm** (moderate; several can coexist as *modes* over one core): editor, canvas, columns, timeline, card-grid, radial.
3. **Data model** (expensive; changes what Carbide *is*): outliner, block-referencing.
4. **Product category** (strategic bet; changes who Carbide is *for*): AI-first, ambient HUD.

Carbide is **file-based markdown** with git/LSP/terminal/plugins/graph/canvas/daily-notes/tasks
already built. That fact decides the rankings: ideas that **reuse** existing capabilities and
**respect the file-based core** are cheap and safe; ideas that **break the data model** are
expensive and risky regardless of how good they look.

## Priority × impact — all 12 distinct ideas

Sorted by priority (impact-per-effort, weighted by strategic fit):

| # | Idea | Layer | Impact | Effort | Reuses | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Timeline / Journal-first** (DS#5) | Nav | High | Low–Med | daily_notes, tasks, git history | **Sleeper hit — do first** |
| 2 | **Atelier / zero-chrome calm** (A, DS#8/#10) | Nav+Visual | Med–High | Low–Med | omnibar, editor | **Cheapest identity win** |
| 3 | **Spatial Canvas** (C, DS#1) | Nav+Visual | High | High | graph, canvas | **Boldest *aligned* bet** |
| 4 | **AI-first conversational** (DS#2) | Category | High | High | AI inline | Strategic bet — as a *mode*, not the spine |
| 5 | **Forge / columns + brutalist** (B) | Nav+Visual | Med–High | Med–High | vim-nav, links, terminal | Strong for power segment |
| 6 | **Zettelkasten card grid** (DS#4) | Nav | Med | Low–Med | metadata, tags, bases, search | Ship as a *view*, not the app |
| 7 | **Dual-mode capture/refine** (DS#8) | Structure | Med | Med | omnibar, editor | Composes with Atelier |
| 8 | **Block-referencing** (DS#9) | Data model | High | Very High | — | Want it? Ship as a *feature*, don't rebuild UI |
| 9 | **Outliner-first** (DS#3) | Data model | High | Very High | — | Abandons file-based core — avoid as primary |
| 10 | **Physical notebook skeuo** (DS#10) | Visual | Med | High | — | Polarizing/dated; salvage as optional theme |
| 11 | **Radial mind map** (DS#7) | Nav | Low–Med | Med | graph | Poor at scale; alt graph *view* only |
| 12 | **Ambient HUD** (DS#6) | Category | Med | High | — | Different product; out of scope |

## Synthesis — recommended shape

Don't bet the app on one corner. The winning shape is **one file-based core + one visual
identity + a few navigation *modes* unified by the command bar:**

- **Default mode:** Atelier-calm editor (#2) — cheap, immediately differentiating.
- **+ Timeline mode (#1)** as the home/landing — highest impact-per-effort on the list; `daily_notes` already exists.
- **+ Canvas mode (#3)** as the flagship "wow" — graph+canvas promoted to first-class.
- **One identity** chosen from paper / brutalist / glass — applied across all modes.
- **AI-first (#4)** added later as a *summonable mode*, not the foundation.

This reframes "dramatic departure" from a high-risk rewrite into a **sequenced rollout**:
ship the cheap identity + timeline win first (validates the direction), then invest in canvas.
Data-model ideas (#8/#9) stay out of the UI decision — pursue them only as standalone features.

**Highest-leverage single move:** make **Timeline/Journal the landing experience** with an
**Atelier visual skin**. Low effort, high differentiation, maximum reuse — and it forecloses
neither Canvas nor AI later.

## Next step (revised)

Spec the **Timeline + Atelier** first step against `docs/architecture.md`: landing route,
which current components survive / change / die, and how `daily_notes` / `tasks` / `git`
compose into the timeline home.
