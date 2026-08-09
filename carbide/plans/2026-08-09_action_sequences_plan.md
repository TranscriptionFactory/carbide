# Action Sequences — Plan

Status: proposed, not started (2026-08-09).

Origin: revives the two live threads in
`../design/programmable_actions_system.md` (Gap 3 / Phase 4, deferred
2026-04-30) and `../feature_opportunity_assay.md:82` ("Visual Automation
Builder", ranked Tier-1 #3, never started). Both were parked on premises that
have since expired. This plan takes the **user-primary, agent-secondary**
framing: the deliverable is a saved, deterministic, inspectable sequence the
user authors and re-runs, which the agent gets to call as a side effect.

## Why now — the expired premises

| Premise when deferred | State 2026-08-09 |
|---|---|
| "Only one first-party plugin exists" (Phase 3 blocker) | 7 plugins in `plugins/` |
| "No plugin currently needs [AI Actions]" (Phase 2.5 blocker) | `wiki-compiler` v0.1.0: `ai:execute` + `fs:read/write` + `sidecar:access`, *"Compile vault notes into an interlinked wiki using LLMs"* |
| 420 actions / 45 reactors | 468 action IDs / 62 reactors |
| Phase 4: "coding agents already sequence natively via MCP" | True, and **only defeats the agent-facing case**. Does not apply to a user who wants the same result every run, offline, at zero token cost. |

The one premise that did **not** expire, and that this plan respects: the
event-trigger surface is unused. All 7 plugins activate on `on_startup`;
zero use `on_file_open:<glob>`; 3 event subscriptions exist across every
plugin. No cron/scheduler exists anywhere in the app
(`editor/domain/idle_task_scheduler.ts` is editor-local and unrelated).
So triggers and scheduling are **out of scope** — see Non-goals.

## Non-goals

- **No triggers, no scheduler.** A sequence is invoked, never fired. Building
  a trigger graph on a trigger surface nothing uses today is speculative.
- **No node-graph canvas.** The assay's visual builder is three projects
  (scheduler + proven triggers + canvas editor) and the canvas is the least
  valuable third. Earn it after people actually write sequences.
- **No conditionals, no loops, no expressions.** The moment `if:` enters the
  YAML this becomes a programming language in a data format, which is how
  every automation builder dies. v1 is a **macro**: a linear list of steps.
- **No cross-plugin RPC** (Phase 3 of the design doc). The one plausible
  chain — `html-strip` → `html-to-markdown` — is better served by a sequence
  than by plugin-to-plugin messaging. Sequences subsume it; do not build it.
- **No AI Actions framework yet.** `wiki-compiler` met the design doc's
  stated build condition, but confirm it is real usage and not a v0.1.0 stub
  before designing an API around it. Tracked, not scheduled here.

## The two structural blockers

Neither design doc mentions these. Both live in
`../../src/lib/app/action_registry/action_registry.ts:1-7`:

```typescript
export type AppAction = {
  id: string;
  label: string;
  shortcut?: string;
  when?: () => boolean;
  execute: (...args: unknown[]) => void | Promise<void>;
};
```

### B1 — Actions carry no parameter schema

An action declares `id`, `label`, `shortcut`, `when`, and nothing about its
arguments. The design doc's `daily-setup.yaml` hand-writes `args:` because a
human already knows what `apply_template` wants. **A composer UI cannot
know.** This is the cost centre of the whole feature and it is invisible in
both source docs.

**Decision: additive, lazily backfilled.** Add an optional field; do not
backfill 468 actions up front.

```typescript
export type ActionParam = {
  name: string;
  type: "string" | "path" | "folder" | "select" | "boolean";
  description: string;
  default?: unknown;
  options?: string[];      // select only
};

export type AppAction = {
  // ...existing fields unchanged
  params?: ActionParam[];
  headless_safe?: boolean;
};
```

The composer offers an action when it takes no arguments **or** declares
`params`. This makes the composable surface self-selecting and grows it on
demand. The unlock: of 247 `execute:` declarations surveyed across
`src/lib/`, **144 take zero arguments** — those are composable on day one
with no backfill at all. That is the v1 surface; it is already large enough
to build every example workflow in the design doc's §3.3.D.

`headless_safe` is the flag the design doc proposed (§3.3.B) and never
added; Phase 3 needs it and it costs nothing to introduce alongside `params`.

### B2 — Actions return `void`

`execute` returns `void | Promise<void>`, so **step 2 cannot consume step 1's
output**. The design doc's YAML example only sequences side effects and never
chains data — which reads as a design choice but is really an unnoticed
constraint.

**Decision: accept it in v1 and make it explicit.** A sequence composes side
effects, not data. This is exactly what makes "macro, not workflow language"
an honest description rather than a limitation we are hiding. "Extract tasks
→ summarize → write index" is *not* buildable here, and the doc should say
so. If demand appears, a typed result channel is an additive change to
`AppAction`, not a rewrite.

### B3 — `when()` guards fail silently

`ActionRegistry.execute` returns early and silently when `when()` is false
(`action_registry.ts:22-24`). Inside a sequence that is a mid-run no-op the
user never sees. The runner must probe availability per step and surface a
skip explicitly. This is a runner concern, not a registry change — do not
alter the existing early-return, other callers depend on it.

## Architecture

Mapped against the decision tree in `../../docs/architecture.md:174`.
New feature module `src/lib/features/sequences/`.

| Concern | Tree branch | Artifact |
|---|---|---|
| Read/write `.carbide/sequences/*.yaml` | Is it IO? | `SequencePort` + `sequences_tauri_adapter.ts` |
| Loaded sequence definitions | Persistent domain data | `state/sequence_store.svelte.ts` |
| Run status / errors | Async op loading+error | OpStore (service writes, component reads) |
| Executing a sequence | Async workflow w/ IO + store updates | `application/sequence_service.ts` |
| Run / reload / edit entry points | User-triggerable action | `application/sequence_actions.ts` |
| Sequence list → omnibar commands | Store change auto-triggers side effect | `reactors/sequence_command_sync.reactor.svelte.ts` |
| Composer dialog open/closed | Ephemeral UI layout | UIStore, component mutates directly |

### Runner → registry coupling

The runner must call `action_registry.execute()` per step, but rule 6 and the
layering lint keep services off concrete app internals. **Follow the existing
precedent** — `PluginRpcActionsBackend`
(`features/plugin/application/plugin_rpc_handler.ts:160`) already solves this
exact problem for the plugin bridge. Mirror its shape:

```typescript
export type SequenceActionsBackend = {
  available(): Array<{ id: string; label: string }>;
  execute(id: string, args: unknown[]): Promise<void>;
};
```

Injected into `SequenceService` via constructor, wired in
`create_app_context.ts` the same way the plugin RPC context is.

**DI ordering note.** `create_app_context` constructs services (step 2)
*before* `register_actions()` runs (step 3). The backend closes over the
registry *instance*, which exists from step 1 and is merely populated later;
execution happens at runtime, long after registration. Do not try to hand the
service a snapshot of the action list at construction time — it will be empty.

### Recursion

A step may name a sequence-run action, so a sequence can invoke itself
directly or via a cycle. The runner carries a depth counter and a visited-set
of sequence IDs; exceeding either aborts the run with a named error. Cheap to
add now, painful to retrofit.

## Scenarios (BDD — define before implementing)

Invariants: a run is linear and ordered; a run never partially reports
success; every step outcome is one of `ran | skipped | failed`; a failed step
halts the run unless marked `continue_on_error`.

- Empty sequence → run succeeds, zero steps reported
- Single no-arg step → step runs, run reports `ran`
- Step naming an unknown action ID → run fails **at load/validation time**,
  not mid-run
- Step whose `when()` is false → reported `skipped`, run continues, user sees it
- Step throws → run halts, prior steps stay applied (no rollback — say so), error surfaces via OpStore
- Step with `continue_on_error: true` throws → run continues, outcome recorded
- Sequence invoking itself → aborts with recursion error, no partial spam
- Sequence A → B → A cycle → aborts with recursion error
- Malformed YAML → load error names the file and line, other sequences still load
- Sequence file added/removed on disk → store reflects it, omnibar commands sync
- Action with `params` → composer renders inputs; missing required param blocks save
- Action without `params` and with arity > 0 → not offered by the composer

Tests live in `tests/unit/` per convention: `domain/` for the YAML
parser/validator, `services/` for the runner, `actions/` for registrations,
`reactors/` for command sync. Shared fixtures in `tests/unit/helpers/`.

## Phases

**Phase 0 — Registry metadata (prerequisite).**
Add optional `params` + `headless_safe` to `AppAction`. Zero backfill. Purely
additive; every existing registration keeps compiling. Ships alone, verifiable
by type-check + existing suite staying green.

**Phase 1 — Format, runner, invocation.**
YAML schema + parser/validator (domain), `SequencePort` + adapter, store,
`SequenceService` runner with the depth guard and per-step outcome reporting,
actions, and the reactor that projects each sequence into the omnibar as a
command. No new UI paradigm — the omnibar is the entry point, as the design
doc's §6 already anticipated. **This is the shippable unit**; a user can
hand-write a `.yaml` and run it.

**Phase 2 — Composer UI.**
Dialog that lists composable actions (no-arg, or `params`-declaring),
builds the step list, and writes the YAML. Backfill `params` on the specific
actions the first real sequences need — demand-driven, not a sweep.

**Phase 3 — Agent exposure (the secondary goal).**
Each saved sequence auto-registers as **one** MCP tool, named and
parameterized by the sequence, gated on `headless_safe` steps. This is the
narrow form of the design doc's deferred Phase 2: the 2026-04 objection
("most of 468 actions are UI-bound and meaningless headlessly") evaporates
because we expose *N user-authored sequences*, never the raw registry. Needs
the Rust→IPC→frontend routing the design doc flagged as the cost; re-evaluate
that estimate against the current `features/mcp/` layout before committing.

## Open decisions

| Decision | Options | Lean |
|---|---|---|
| Feature module name | `sequences` / `automation` / `macros` | `sequences` — matches the doc lineage, short-noun convention (`clip`, `query`, `task`) |
| Storage location | `.carbide/sequences/*.yaml` vs one file | Per-file — versionable, matches `.carbide/plugins/` precedent |
| Step failure default | halt vs continue | Halt; `continue_on_error` opt-in per step |
| Rollback on mid-run failure | none / undo stack | None in v1, stated loudly in the UI. An undo stack across arbitrary actions is its own project |
| `params` backfill scope | on-demand vs sweep of arg-taking actions | On-demand. 87 of 247 surveyed declarations take args, all typed `unknown` and narrowed inline — a sweep is a large, low-signal diff |
| Sequences callable as steps | yes / no | Yes, with the depth guard — it is the composition story. Reconsider if the guard gets complicated |

## Relation to existing systems

- **Reactors** stay internal infra. Sequences are the user-facing equivalent,
  as `../design/programmable_actions_system.md:340` already argued.
- **Prompt recipes** (`shared/domain/prompt_recipes.ts`) are *not* this. A
  recipe routes a single assistant turn (`context_sources`, `tool_policy`,
  `apply_behavior`); it has no params, no steps, no vault mutation loop. No
  overlap, no collision — but a later "run recipe" action would make recipes
  addressable *from* a sequence, which is the natural seam.
- **Plugin actions bridge** (`actions:execute`, shipped Phase 1) already lets
  plugins drive the registry. Sequences use the same dispatch path, so
  plugin-contributed actions become composable for free.
