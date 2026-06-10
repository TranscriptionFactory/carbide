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
| Open a note / switch to editor / canvas | **Action Registry** | reuse `note.*`, `tab.*`, canvas actions |
| Theme token additions (serif, display scale…) | **theme feature** | `palette_generator.ts` + `theme.ts` + `design_tokens.css` |
| New native IO? | **None** | no new port/adapter required (see §5) |

**Headline:** Timeline needs **no new port, no new domain store, and (likely) no new service** — it is a
*projection* over data the app already holds, plus a layout component and a handful of theme tokens.

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
  day_limit?: number;                // default e.g. 60 days
}): StreamDay[] { /* group by local date_key, sort desc, cap */ }
```

- `now_ms` is **injected** (the app already passes `now_ms: () => Date.now()` into the context) so the
  function stays deterministic and testable — matches the existing pattern.
- Grouping is by **local** calendar day; spec a single `to_date_key(ms, tz)` helper, tested across DST.
- The view-model is then `const stream = $derived(build_stream({...}))` inside `timeline_layout.svelte`
  (or a `$derived.by` in a small store-less selector), so it recomputes when any source store changes —
  satisfying the decision tree's "Computed from existing state → `$derived`".

---

## 5. The one IO question: git commits

`GitPort.log(...)` already exists and returns `GitCommit[]`. The only open item is **who loads recent
commits into reactive state and when**:

- **If `GitStore` already retains recent history** (the git feature has a history UI) → reuse it; pure
  `$derived`, nothing new.
- **If not** → add a thin load on vault-open: an existing-or-new action `git.load_recent_log` →
  `git_service` calls `git_port.log({ since, max })` → writes `git_store.recent_commits`. This is the
  standard "Async workflow with IO + store updates → Service method" route. A reactor may refresh it on
  commit (git autocommit already fires), or the Stream simply reads whatever history is loaded.

**Action item for implementation:** confirm `GitStore` history retention before deciding. Default to
*reuse*; only add the loader if absent. No new port either way.

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
5. **Secondary accent** for "today"/commit glyphs/kickers — cheapest path: reuse `--indicator-dirty` /
   `--warning`; otherwise derive from `accent_hue + offset`. Avoid a new theme param unless needed.
6. **`layout_variant: "timeline"`** added to the `ThemeLayoutVariant` union (+ optional
   `LAYOUT_TO_DATA_THEME["timeline"] = "paper"` default mapping).

All Timeline components consume tokens from the mapping doc §3–4; **none hardcode** the prototype's
literal colors/fonts. → the Stream re-skins under every current and future theme automatically.

---

## 7. UI behaviour

- **Landing:** when `layout_variant === "timeline"`, the main pane renders the Stream. Today's block is
  pinned top with the daily-note compose card + surfaced urgent tasks.
- **Open:** clicking an entry runs `note.open` / `tab.*` via the action registry → editor surface (the
  existing editor; "Editor mode" in the mockup = an open note).
- **Canvas:** existing canvas feature; reachable via command bar / action — not new here.
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

Component tests stay light; the heavy logic is the pure derivation, which is fully deterministic given
injected `now_ms`.

---

## 9. Build sequence

1. **Tokens + serif field** (theme feature) → verify existing themes still render. *Commit.*
2. **`stream_types.ts` + `build_stream.ts`** (pure domain) + unit tests for scenarios 1–7. *Commit.*
3. **`timeline_layout.svelte`** consuming `build_stream`, reading existing stores via entrypoints; wire
   `is_timeline` branch in `workspace_layout.svelte`. *Commit.*
4. **Sub-components** (`stream_day`, `stream_note_card`, `stream_activity_row`) + edge peeks reuse. *Commit.*
5. **Git commit loading** only if §5 shows it's missing. *Commit.*
6. **Atelier + Atelier-Glass built-in themes** (paper/glass presets selecting `layout_variant: "timeline"`).
   *Commit.*
7. Post-edit: `code-simplifier` pass; then validation checklist.

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

- [x] **Prose font** — DECIDED: Inter (no serif). Removes the `--font-family-serif` addition.
- [x] **Left sidebar** — DECIDED: persistent vault tree at the left edge (reuse existing sidebar).
- [ ] **`day_limit`** for the Stream window (default 60 days?) + whether older days lazy-load on scroll.
- [ ] **Git history retention** in `GitStore` (§5) — reuse vs add a loader.
- [ ] **Mode switcher** in the top bar: explicit (Timeline/Editor/Canvas pills) vs implicit (open-note →
      editor, command-bar → canvas). Mockup shows explicit; implicit is simpler and more "calm".
- [ ] **Secondary accent** source (reuse indicator/warning vs new derived hue).
