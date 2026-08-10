# Action Sequences — Plan

Status: proposed, not started (2026-08-09). Revised 2026-08-09 after a
claim-by-claim verification pass against the tree at `44779468` — see
Verification log at the end for what changed and why.

Origin: revives the two live threads in
`../design/programmable_actions_system.md` (Gap 3 / Phase 4, deferred
2026-04-30) and `../feature_opportunity_assay.md:82` ("Visual Automation
Builder", ranked Tier-1 #2, never started). Both were parked on premises that
have partly expired. This plan takes the **user-primary, agent-secondary**
framing: the deliverable is a saved, deterministic, inspectable sequence the
user authors and re-runs, which the agent gets to call as a side effect.

## Why now — which premises actually expired

| Premise when deferred | State 2026-08-09 | Expired? |
|---|---|---|
| "Only one first-party plugin exists" (Phase 3 blocker) | 7 plugins in `plugins/` | Yes |
| 420 actions / 45 reactors | 461 `ACTION_IDS` entries / 478 `registry.register` calls / 55 reactors | Yes — surface grew ~14% |
| "No plugin currently needs [AI Actions]" (Phase 2.5 blocker) | `wiki-compiler` v0.1.0 *declares* `ai:execute`, but `plugins/wiki-compiler/index.html` only ever calls `carbide.sidecar.*` — the permission is unused | **No.** Declared-but-unused. The blocker stands |
| Phase 4: "coding agents already sequence natively via MCP" | Defeats only the *agent-facing* case | Partly — but see Necessity below, which raises a second objection the design doc itself supplies |

The scope-limiting premise that also did **not** expire: the event-trigger
surface is unused. All 7 plugins activate on `on_startup`; the
`on_file_open:${string}` variant exists in `features/plugin/ports.ts:8` and
zero plugins use it; 3 event subscriptions exist across every
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

## Necessity — why this may not need to be core

The design doc's Phase 1 **shipped**: `actions:execute`, `commands:register`,
`fs:read`, and plugin commands merged into the omnibar
(`search_service.ts:505`). A user can therefore build this plan's Phase 1
**today, as a plugin**, with zero core changes: read `.carbide/sequences/*.yaml`
via `fs:read`, register one command per sequence via `commands:register`, loop
`carbide.actions.execute()` per step. The design doc says exactly this — *"The
action-runner plugin would be a simple loop over steps, calling
`carbide.actions.execute()` for each."*

So the Phase 4 deferral rationale is defeated for agents but **not** for users:
the plugin path defeats the user-facing case too. What genuinely requires core
work is narrower than this plan originally assumed:

| Capability | Buildable as a plugin? | Why |
|---|---|---|
| Parse + run a linear YAML sequence | **Yes** | `actions:execute` + `fs:read` |
| Sequence appears in the omnibar | **Yes** | `commands:register` → `PluginStore.commands` |
| Per-step `skipped` reporting | **Yes** | `carbide.actions.available()` already exposes the `when()` filter |
| **Composer UI over the action list** | **No** | Needs `params` — a plugin cannot see action arity (B1) |
| **MCP exposure of a sequence** | **No** | Needs Rust→IPC→frontend routing |

**Consequence for phasing.** Phase 0 is the only unambiguously core-shaped
work, and (per B1 below) it is also a hard prerequisite for the first useful
sequence rather than a Phase-2 concern. Phase 1 should be built as a plugin
prototype first — it is cheap, it produces the demand evidence this plan
currently lacks, and promotion into `src/lib/features/sequences/` can be
decided on that evidence rather than in advance. The core architecture below
is written so that promotion is a move, not a rewrite.

## The structural blockers

Neither design doc mentions these. B1–B3 live in
`../../src/lib/app/action_registry/action_registry.ts:1-7`; B4 is a seam
mismatch between two registries that only looks like one:

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
backfill 478 registrations up front.

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
demand. Measured across `src/lib/**/*_actions.ts` (478 `execute:`
declarations, one per `registry.register` call):

| Shape | Count |
|---|---|
| `execute: () =>` / `execute: async () =>` — zero-arg, composable on day one | **250** |
| `execute: (...) =>` — takes args, needs `params` to be composable | **223** |
| `execute: some_fn` — function reference, arity must be read at the definition | 5 |

**But zero-arg alone is not a shippable v1, and this is the correction that
matters most.** The design doc's §3.3.D contains exactly one example
workflow, `daily-setup.yaml`, and it does not survive contact with the
registry:

| Step | Status |
|---|---|
| `daily_notes.open_today` | Exists (`action_ids.ts:517`), zero-arg ✓ |
| `apply_template` + `args:` | **No such action ID**, and takes args |
| `ui.show_notice` + `args:` | **No such action ID**, and takes args |

So the one workflow cited as proof that the zero-arg surface is useful cannot
be built from the zero-arg surface — 2 of its 3 steps need `params`, and 2 of
its 3 actions do not exist yet. `params` is therefore a **prerequisite for
the first real sequence**, not a Phase-2 convenience. Phase 0 absorbs a
targeted backfill accordingly.

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
alter the existing early-return, other callers depend on it. `get_available()`
(`action_registry.ts:33`) already applies the `when()` filter, so the probe
costs nothing to build.

### B4 — "The omnibar" is a second registry, and it is not the ActionRegistry

The 461-entry `ActionRegistry` is **not** what the command palette displays.
`get_all()` / `get_available()` have exactly one consumer in the app: the
plugin RPC backend (`create_app_context.ts:1169`). The palette is a separate,
hand-maintained `CommandDefinition[]` in
`features/search/domain/search_commands.ts`, bridged to actions by the static
`COMMAND_TO_ACTION_ID` map at
`features/search/application/omnibar_actions.ts:307`.

Two consequences the original plan missed:

1. **"A reactor projects each sequence into the omnibar" does not describe
   real wiring.** The dynamic seam exists, but it is
   `search_service.ts:505` — `const dynamic_commands = this.plugin_store?.commands ?? []`.
   Projecting sequences means feeding that same merge point from a sequence
   store, plus a dispatch branch. Follow the plugin convention exactly: a
   namespaced command id (`sequence:<id>`), matched by the
   `command_id.includes(":")` branch at `omnibar_actions.ts:323`.
2. **`ActionRegistry` has no `unregister`.** A sequence deleted on disk can
   never be removed from it. This is precisely why `PluginStore` holds its
   commands in a `SvelteMap` with `register_command` / `unregister_command`
   (`plugin_store.svelte.ts:21-36`) instead of using the registry. A sequence
   store must do the same. Do **not** add `unregister` to `ActionRegistry` to
   work around this — the registry is deliberately append-only for the app's
   static action set.

Note that B4 dissolves entirely on the plugin path: a plugin already gets the
correct seam for free via `commands:register`.

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
| Sequence list → omnibar commands | Computed from existing state (**not** a reactor — see B4) | `SequenceStore.commands` (`SvelteMap`), merged at `search_service.ts:505` alongside `plugin_store.commands`; dispatched via a `sequence:<id>` branch in `omnibar_actions.ts` |
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

**DI ordering note.** Mirroring the precedent sidesteps the ordering question
rather than solving it: the registry is constructed at
`create_app_context.ts:164`, `register_actions()` runs at `:1023`, and the
existing actions backend is wired at `:1167` — *after* registration. Wire the
sequence backend in the same place and the list is already populated. The
underlying safety property still holds if it ever moves earlier (the backend
closes over the registry *instance*, and execution happens at runtime), but do
not rely on it: do not hand the service a snapshot of the action list at
construction time.

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
- Sequence file added/removed on disk → store reflects it, omnibar commands
  sync **and the removed command disappears** (the case `ActionRegistry`
  cannot express — see B4)
- Action with `params` → composer renders inputs; missing required param blocks save
- Action without `params` and with arity > 0 → not offered by the composer

Tests live in `tests/unit/` per convention: `domain/` for the YAML
parser/validator, `services/` for the runner, `actions/` for registrations,
`reactors/` for command sync. Shared fixtures in `tests/unit/helpers/`.

## Phases

**Phase 0 — Registry metadata + first-workflow backfill (the core prerequisite).**
Add optional `params` + `headless_safe` to `AppAction` — purely additive,
every existing registration keeps compiling. Then backfill `params` on the
handful of actions the *first* real sequence needs, and add the two actions
§3.3.D assumes but the registry lacks (`apply_template`, `ui.show_notice`) or
pick a replacement first workflow built from actions that do exist. Per B1
this is not deferrable to Phase 2: without it there is no useful sequence to
run. Ships alone, verifiable by type-check + existing suite staying green.
This is the only phase that is unambiguously core-shaped.

**Phase 1 — Format, runner, invocation (build as a plugin first).**
YAML schema + parser/validator, sequence loading, the runner with the depth
guard and per-step outcome reporting, and one omnibar command per sequence.
**This is the shippable unit**; a user can hand-write a `.yaml` and run it.

Per Necessity, build this as a plugin against the shipped `actions:execute` /
`commands:register` / `fs:read` surface. It needs no core changes, gets B4's
seam for free, and is the cheapest way to learn whether anyone writes
sequences. Keep the parser/validator as a pure module so promotion into
`src/lib/features/sequences/` is a move, not a rewrite.

**Promotion gate (decide here, not in advance).** Move Phase 1 into core when
at least one holds: sequences need a store the omnibar must reactively track
beyond what `PluginStore.commands` gives; the runner needs OpStore progress
reporting a plugin cannot write; or Phase 3 lands and needs the runner
in-process. Absent all three, leave it a plugin.

**Phase 2 — Composer UI.**
Dialog that lists composable actions (no-arg, or `params`-declaring),
builds the step list, and writes the YAML. Requires core (a plugin cannot see
action arity). Continue backfilling `params` demand-driven, not as a sweep.

**Phase 3 — Agent exposure (the secondary goal).**
Each saved sequence auto-registers as **one** MCP tool, named and
parameterized by the sequence, gated on `headless_safe` steps. This is the
narrow form of the design doc's deferred Phase 2: the 2026-04 objection
("most of the 420 action registry entries are UI-bound and meaningless
headlessly") evaporates
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
| `params` backfill scope | on-demand vs sweep of arg-taking actions | On-demand — but the debt is larger than first estimated: **223 of 478** declarations take args, all typed `unknown` and narrowed inline. A sweep is a very large, low-signal diff; on-demand is the only tractable option, and Phase 0 must still backfill enough for one real workflow |
| Phase 1 home | core feature module vs plugin | **Plugin first**, promoted on the Phase 1 gate. Core costs more and answers no open question |
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
  plugin-contributed actions become composable for free. Per Necessity, this
  bridge is also strong enough to *host* Phase 1 outright.

## Verification log (2026-08-09, tree `44779468`)

Every claim in the first draft was checked against source. Confirmed as
written: `AppAction` shape and the silent `when()` return
(`action_registry.ts:1-7`, `:22-24`); `PluginRpcActionsBackend` at
`plugin_rpc_handler.ts:160`; the decision-tree branch names at
`docs/architecture.md:174`; 7 plugins all on `on_startup` with
`on_file_open:${string}` unused; `.carbide/plugins` as a per-directory
precedent; `idle_task_scheduler.ts` as editor-local; `prompt_recipes.ts` as
non-overlapping. `yaml@2.8.3` is already a dependency, so the format needs no
new package.

Corrected:

| First draft | Measured | Impact |
|---|---|---|
| "144 of 247 `execute:` declarations are zero-arg" | 250 zero-arg / 223 arg-taking / 5 fn-ref, of 478 | The 247 figure counted `id: "` occurrences, not `execute:`. Backfill debt is ~2.5× the estimate |
| "already large enough to build every example workflow in §3.3.D" | §3.3.D's only workflow needs args on 2 of 3 steps, and 2 of its 3 action IDs do not exist | **Load-bearing.** Re-phased: `params` moved into Phase 0 |
| `wiki-compiler` proves the AI-Actions blocker expired | `ai:execute` declared, never called — only `carbide.sidecar.*` is used | Row struck from the Why-now table; blocker stands |
| 468 action IDs / 62 reactors | 461 `ACTION_IDS` entries / 55 reactors | Cosmetic |
| Assay ranks it Tier-1 #3 | Tier-1 **#2** (line 82 cited correctly) | Cosmetic |
| Reactor projects sequences into the omnibar | Omnibar reads `CommandDefinition[]`, not `ActionRegistry`; registry has no `unregister` | New blocker B4; architecture row rewritten |
| DI ordering hazard (services before `register_actions`) | Existing backend is wired at `:1167`, after `register_actions` at `:1023` | Hazard does not arise if the precedent is mirrored |

Unchanged and still endorsed: the non-goals, the BDD scenario list, the
recursion guard, B2's honest framing of the `void` return, and the
injected-backend pattern.
