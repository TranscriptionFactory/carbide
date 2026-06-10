# Spec — Timeline ("The Stream") Layout

**Date:** 2026-06-10
**Status:** Architecture spec, pre-implementation. Routed against `docs/architecture.md` decision tree.
**Inputs:** `2026-06-10_ui_redesign_concepts.md` (recommendation), `2026-06-10_timeline_token_mapping.md`
(token bridge), prototypes `designFiles/carbide/v5/Carbide v5 · Atelier(-Glass).html`.

The recommendation: **Timeline-first landing ("The Stream") + Atelier/glass visual identity**, modes
(Editor/Canvas) unified by the command bar. This spec places every piece against the codebase
architecture and defines the build.

---

## 1. Placement decision (the pivotal one)

**Timeline is a new `ThemeLayoutVariant` value, `"timeline"`** — following the existing `dashboard` /
`zen_deck` / `spotlight` precedent. Verified: `workspace_layout.svelte` already branches on
`stores.ui.active_theme.layout_variant` with ~14 `is_*` flags, and `dashboard` is itself a landing-style
surface with `dashboard_task_counts` derivations and header actions. Timeline is the same genre, so it
uses the same mechanism rather than inventing a new one.

- **Visual identity** (paper/glass, serif, accent) = **theme params** (`css_theme: "paper"`,
  `surface_style`, hues, fonts) — already supported, plus the small token additions in §6.
- **Timeline structure** (the Stream as the main surface) = **`layout_variant: "timeline"`**.
- Because `data-color-scheme`, `surface_style`, and `layout_variant` are independent, the *same* Stream
  re-skins under Nordic Dark / paper / glass with no layout change.

*Rejected alternative:* a UIStore ephemeral "home view". Cleaner-sounding, but it would diverge from the
established `dashboard` pattern and duplicate the layout-switch plumbing that already exists. Not worth it.

---

## 2. Decision-tree routing

Per `docs/architecture.md` §"Decision tree: where does new code go?":

| Concern | Route | Detail |
|---|---|---|
| Timeline layout selection | **Domain store (theme)** | new `layout_variant` enum value; persisted with the theme |
| The Stream feed (days, edits, tasks, commits) | **`$derived` + pure domain fn** | computed from existing stores; see §4 |
| "Files edited on day D" | **`$derived`** | `NoteMeta.mtime_ms` already exists on `notes_store.notes` |
| Daily-note body for day D | **`$derived`** | lookup by `daily_notes` path convention |
| Tasks surfaced per day | **`$derived`** | read `task` feature store |
| Git commits per day | **IO via existing `GitPort.log()`** | load through existing git history path; see §5 |
| Which day is expanded / compose focus | **Component-local `$state`** | visual-only |
| Primary surface (Timeline/Editor/Canvas pills) | **UIStore ephemeral + actions** | `ui.timeline_surface`; pills dispatch `timeline.show_*` actions |
| Open a note / switch to editor / canvas | **Action Registry** | reuse `note.*`, `tab.*`, canvas actions |
| Theme token additions (serif, display scale…) | **theme feature** | `palette_generator.ts` + `theme.ts` + `design_tokens.css` |
| New native IO? | **None** | no new port/adapter required (see §5) |

**Headline:** Timeline needs **no new port and no new domain store** — it is mostly a *projection* over
data the app already holds. The only additive state is two small slices on *existing* stores
(`GitStore.recent_commits`, `UIStore.timeline_surface`), one `git_service` method, the `timeline.show_*`
actions, a layout component, and a handful of theme tokens.

---

## 3. Module placement

A thin new **`timeline` feature slice** owns only what's genuinely new — the pure aggregation and the UI:

```
src/lib/features/timeline/
├── index.ts                      # entrypoint (re-exports TimelineLayout, build_stream, types)
├── domain/
│   ├── build_stream.ts           # pure: (inputs) -> StreamDay[]   ← the core logic, fully unit-testable
│   └── stream_types.ts           # StreamDay, StreamEntry, StreamEntryKind
└── ui/
    ├── timeline_layout.svelte     # the Stream shell (rendered when layout_variant === "timeline")
    ├── stream_day.svelte          # one day block (rule + cards + activity)
    ├── stream_note_card.svelte
    └── stream_activity_row.svelte
```

- `workspace_layout.svelte` adds `is_timeline = $derived(layout_variant === "timeline")` and renders
  `<TimelineLayout/>` (imported from `$lib/features/timeline`) in its main pane, exactly as it already
  switches the other variants.
- Cross-feature reads (`note`, `task`, `git`, `daily_notes`) go through their `index.ts` entrypoints.
- No `ports.ts`, no `state/`, no `*_service.ts` in `timeline` unless §5 forces a commit-loading service.
- Respects layering lint: a component importing other features' *stores via entrypoints* is allowed;
  `build_stream` is pure domain (no IO, no framework).

---

## 4. Data model & the pure derivation

```ts
// stream_types.ts
export type StreamEntryKind = "edit" | "daily_note" | "task" | "commit";

export type StreamEntry = {
  kind: StreamEntryKind;
  note_id?: NoteId;          // for edit/daily_note
  title: string;             // first heading or filename / commit subject / task text
  subpath?: string;          // display path
  at_ms: number;
  done?: boolean;            // tasks
};

export type StreamDay = {
  date_key: string;          // "2026-06-10" (local)
  is_today: boolean;
  daily_note?: NoteMeta;     // the day's daily note, if present
  entries: StreamEntry[];    // edits + commits + tasks for the day, newest first
  tags: { tag: string; count: number }[];  // aggregated from the day's edited notes
};

// build_stream.ts — PURE, no IO, no $state
export function build_stream(input: {
  notes: NoteMeta[];                 // notes_store.notes (carry mtime_ms)
  commits: GitCommit[];              // from GitPort.log (see §5)
  tasks: TaskItem[];                 // task feature store
  daily_note_path: (date: string) => string;  // daily_notes domain helper
  now_ms: number;                    // injected (no Date.now in domain)
  entry_limit?: number;              // DECIDED: cap initial render ~200 entries; "Show older" raises it
}): StreamDay[] { /* group by local date_key, sort desc, cap at entry_limit */ }
```

- `now_ms` is **injected** (the app already passes `now_ms: () => Date.now()` into the context) so the
  function stays deterministic and testable — matches the existing pattern.
- Grouping is by **local** calendar day; spec a single `to_date_key(ms, tz)` helper, tested across DST.
- The view-model is then `const stream = $derived(build_stream({...}))` inside `timeline_layout.svelte`
  (or a `$derived.by` in a small store-less selector), so it recomputes when any source store changes —
  satisfying the decision tree's "Computed from existing state → `$derived`".

---

## 5. The one IO question: git commits

**DECIDED: add a thin vault-wide loader.** Verified: `GitStore.history` is **per-note and
dialog-scoped** (`history_note_path`, loaded only when the version-history dialog opens for a note), so
it cannot feed a vault-wide Stream. But the port already supports vault-wide queries —
`git_port.log(vault_path, note_path, limit)` takes `note_path: string | null`, and **`null` returns
all-files history**. So:

- Add `git_store.recent_commits = $state<GitCommit[]>([])` (a new slice, distinct from the per-note
  `history` so the two don't collide).
- Add `git_service.load_recent_commits(limit)` → `git_port.log(vault_path, null, limit)` → writes the
  slice. Standard "Async workflow with IO + store updates → Service method" route.
- Trigger via a `git.load_recent_commits` action on Timeline mount; refresh after autocommit (the git
  autocommit reactor already fires — extend or add a small reactor to re-pull).
- **No new port.** ~30 lines total. The Stream then reads `recent_commits` in its `$derived`.

---

## 6. Theme / token changeset

From `2026-06-10_timeline_token_mapping.md` §5 — the genuinely-new tokens, as one theme-feature change:

1. **Prose font — DECIDED: Inter (Carbide's existing `font_family_sans` default).** No serif. This
   **removes** the previously-proposed `--font-family-serif` theme field entirely — the Timeline prose
   reuses the font Carbide already ships, so there is *no new font infra* (no field, no bundling, no
   settings UI change). Atelier is a calm *sans* identity, not editorial. (Serifs Newsreader and Literata
   were both rejected.)
2. **Display type scale** — current scale tops at `--text-lg` (16px). Add `--text-xl`, `--text-2xl`,
   `--text-display` (or reuse `--editor-heading-1..3`) for the stream H1 / day-date / doc-title.
3. **Glass depth tiers + blur** — add `--glass-subtle`, `--glass-edge`, `--glass-blur` to
   `palette_generator` (driven by `glass_alpha`) so glass surfaces are consistent; system currently ships
   only `--glass` / `--glass-strong`.
4. **`--measure-prose`** (~68ch) — the centered reading-column width.
5. **Secondary accent — DECIDED: reuse `--indicator-dirty` / `--warning`.** The "today" marker, commit
   glyphs, and kickers are low-stakes; reusing existing indicator tokens keeps every theme consistent for
   free. **No new theme param** (`secondary_accent_hue` rejected).
6. **`layout_variant: "timeline"`** added to the `ThemeLayoutVariant` union (+ optional
   `LAYOUT_TO_DATA_THEME["timeline"] = "paper"` default mapping).

All Timeline components consume tokens from the mapping doc §3–4; **none hardcode** the prototype's
literal colors/fonts. → the Stream re-skins under every current and future theme automatically.

---

## 7. UI behaviour

- **Explicit 3-way pills** (DECIDED): the top bar shows `Timeline | Editor | Canvas`, always visible.
  Active surface is held in **`UIStore.timeline_surface`** (`"timeline" | "editor" | "canvas"`), mutated
  by `timeline.show_timeline` / `show_editor` / `show_canvas` actions. The layout renders the matching
  surface in the main pane (sidebar + top bar stay put).
- **Landing:** default `timeline_surface === "timeline"` → the Stream. Today's block pinned top with the
  daily-note compose card + surfaced urgent tasks.
- **Editor surface:** shows the active note (the existing editor). Clicking a Stream entry runs
  `note.open` / `tab.*` and sets `timeline_surface = "editor"`.
  **Empty-editor state (DECIDED):** if the Editor pill is selected with no active note, render a calm
  placeholder — "No note open · pick one from the Stream or press ⌘K" — not a blank editor. Avoids the
  awkward empty state the explicit-pills choice otherwise implies.
- **Canvas surface:** the existing canvas feature; empty canvas is a valid state (it's a spatial
  surface, not note-bound). Not new work here.
- **Left sidebar is persistent, not a peek** (decided): the vault file tree stays accessible at the
  leftmost edge — where it lives today. The Timeline layout **reuses the existing sidebar / vault tree
  components** rather than hiding them behind a hover reveal. This relaxes the pure zero-chrome stance and
  *reduces* new work (no left-edge reveal interaction to build).
- **Right edge stays a peek** (context / backlinks / git) and **⌘K** reuses the omnibar; the right peek
  reveal is component-local visual state.
- **Empty/edge states** are first-class — see §8.

---

## 8. BDD scenarios (→ `tests/unit/`)

Invariants first, per AGENTS.md BDD guidance. `build_stream` is the primary unit under test
(`tests/unit/domain/` or `tests/unit/features/timeline/`):

1. **Empty vault** → `build_stream` returns `[]`; layout shows an empty-stream affordance, no crash.
2. **No daily note today** → today's block renders with a compose card and `daily_note === undefined`.
3. **Dense edit-sweep day** (the 2026-06-09 metabolomicPriors case, 14 edits) → entries grouped under one
   `StreamDay`, sorted newest-first, tag aggregation correct, count surfaced; long lists collapse ("+N more").
4. **Git-dirty state** → uncommitted files reflected; commits of day D appear as `kind: "commit"` entries.
5. **DST / timezone boundary** → an edit at 23:30 and 00:30 land in the correct local `date_key`.
6. **Theme switch** (paper ↔ glass ↔ Nordic Dark) re-skins the same Stream — no layout/structure change
   (component reads tokens only; assert no hardcoded color/font in the layout's scoped styles).
7. **Tasks** → done vs open tasks render correctly; done tasks styled struck-through.
8. **Entry cap + "Show older"** → with > `entry_limit` entries, `build_stream` caps at the limit; raising
   the limit (Show-older) yields a superset with stable ordering (no duplication/reorder of shown days).
9. **Explicit mode switch** → `timeline_surface` transitions Timeline→Editor→Canvas update the main pane
   only (sidebar/top-bar unchanged); Editor with no active note renders the placeholder, not a blank doc.

Component tests stay light; the heavy logic is the pure derivation, which is fully deterministic given
injected `now_ms`.

---

## 9. Build sequence

1. **Tokens + `layout_variant: "timeline"`** (theme feature): display type scale, glass tiers/blur,
   `--measure-prose`, secondary-accent aliases to indicator tokens, enum value. No serif field. → verify
   existing themes still render. *Commit.*
2. **`stream_types.ts` + `build_stream.ts`** (pure domain) + unit tests for scenarios 1–8. *Commit.*
3. **Git vault-wide loader** (§5): `git_store.recent_commits` + `git_service.load_recent_commits` +
   `git.load_recent_commits` action + autocommit refresh. *Commit.*
4. **`UIStore.timeline_surface` + `timeline.show_*` actions** (Timeline/Editor/Canvas pills) + empty-editor
   placeholder. Unit-test the surface transitions (scenario 9). *Commit.*
5. **`timeline_layout.svelte`** consuming `build_stream` + `recent_commits`, reading existing stores via
   entrypoints; wire `is_timeline` branch + the 3-way pills + "Show older" (`entry_limit`) in
   `workspace_layout.svelte`. *Commit.*
6. **Sub-components** (`stream_day`, `stream_note_card`, `stream_activity_row`) + reuse existing sidebar
   (left) and right-edge context peek. *Commit.*
7. **Atelier + Atelier-Glass built-in themes** (paper/glass presets selecting `layout_variant: "timeline"`).
   *Commit.*
8. Post-edit: `code-simplifier` pass; then validation checklist.

---

## 10. Validation (per architecture.md)

```bash
pnpm check
pnpm lint            # incl. lint:layering — confirm timeline slice respects boundaries
pnpm test            # build_stream scenarios + component tests
cd src-tauri && cargo check   # no Rust change expected
pnpm format
```

Layering expectations: `timeline/domain/build_stream.ts` imports no ports/adapters/framework;
`timeline/ui/*` imports other features only through entrypoints; no `invoke()` anywhere in the slice.

---

## 11. Open decisions (need sign-off before/at implementation)

All resolved as of 2026-06-10:

- [x] **Prose font** — Inter (no serif). Removes the `--font-family-serif` addition.
- [x] **Left sidebar** — persistent vault tree at the left edge (reuse existing sidebar).
- [x] **Stream window** — recent **~200 entries** + explicit **"Show older"** button (raises
      `entry_limit`); no auto/infinite scroll.
- [x] **Git history** — add a thin **vault-wide loader** (`recent_commits` slice +
      `load_recent_commits` via `git_port.log(vault_path, null, N)`); per-note `history` is unsuitable. No
      new port.
- [x] **Mode switcher** — **explicit 3-way pills** (Timeline/Editor/Canvas) backed by
      `UIStore.timeline_surface`; Editor-with-no-note shows a placeholder, not a blank editor.
- [x] **Secondary accent** — reuse `--indicator-dirty` / `--warning`; no new theme param.

No open decisions remain. Ready to implement per the §9 build sequence.
