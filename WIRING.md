# AU-005 wiring instructions

Everything below is for the **orchestrator's merge commit**. AU-005 touched no wiring
hotspot: no `editor_status_bar.svelte`, no `create_app_context.ts`, no feature `index.ts`,
no action registry, no `DEFAULT_HOTKEYS`, no `workspace_layout.svelte`.

## 1. Barrel exports to add

`src/lib/features/assistant/index.ts` (owned by you, not by this lane):

```ts
export { default as AssistantPresence } from "$lib/features/assistant/ui/assistant_presence.svelte";
export { default as AssistantRunsPopover } from "$lib/features/assistant/ui/assistant_runs_popover.svelte";
export { default as AssistantStopButton } from "$lib/features/assistant/ui/assistant_stop_button.svelte";
```

Matches how `features/git` and `features/lint` export `GitStatusWidget` /
`LintStatusIndicator`, which is how the status bar already consumes widgets.

## 2. Status bar mount point

`src/lib/features/editor/ui/editor_status_bar.svelte`, **right-hand
`.StatusBar__section`**, immediately after the `{#if git_enabled}` block that ends at
line 569 and before the theme-toggle separator at line 571:

```svelte
<span class="StatusBar__separator" aria-hidden="true"></span>
<AssistantPresence runs={assistant_runs} on_stop={on_assistant_stop} />
```

Import alongside the existing widget imports (lines 21-22):

```ts
import { AssistantPresence } from "$lib/features/assistant";
```

Placement rationale: presence is a persistent daemon indicator, so it belongs with
git/index status on the right, not with the per-document toggles on the left. Design §2
puts it in `.right` immediately left of the encoding cell; the theme toggle is our
equivalent trailing cell.

## 3. Props the status bar must forward

`AssistantPresence` is pure props + callbacks — it imports no service and reads no
context, per `docs/architecture.md` rule 6 ("components do not import services"). The
status bar is already a fully props-driven component, so add these to its `Props`
interface and pass them down from `workspace_layout.svelte`:

| Prop      | Type                  | Required | Source                                                            |
| --------- | --------------------- | -------- | ----------------------------------------------------------------- |
| `runs`    | `RunRecord[]`         | yes      | `assistant_run_store.all`                                         |
| `on_stop` | `(id: RunId) => void` | yes      | dispatch to the kernel — see §4                                   |
| `now`     | `() => number`        | no       | omit in production; defaults to `Date.now`. Tests inject a clock. |

Two props total. There is no detachment prop — see §5.

Pass `assistant_run_store.all`, **not** `.active`. The component does its own filtering
and must see errored runs, which `.active` excludes by design.

## 4. Stop dispatch — the one thing I need from you

`on_stop` must reach `AssistantKernelService.stop(id)`. Components may not call services
directly, so this needs an action. **I did not create it** — action registries are a
wiring hotspot.

Expected action id: `ACTION_IDS.ASSISTANT_STOP_RUN`, taking the run id as its payload.

```ts
const on_assistant_stop = (id: RunId) => {
  void action_registry.execute(ACTION_IDS.ASSISTANT_STOP_RUN, { run_id: id });
};
```

If AU-001's kernel is not merged when you wire this, `on_stop` can be a no-op and every
AU-005 test still passes — the components never assume the callback does anything.

Also worth registering while you are in the registry: `ASSISTANT_STOP_ALL_RUNS` for the
global `esc` path that `AssistantStopButton`'s `hint="esc"` advertises. AU-005 renders the
hint but binds no hotkey; `DEFAULT_HOTKEYS` is yours.

## 5. No detachment concept in W0 (deliberate)

There is no `detached_ids` prop and no "run detached" sub-line. Run↔surface association is
only knowable in W1 when sessions land, so any such prop would be wired as a permanently
empty set — speculative future-proofing that AGENTS.md rules out.

I2 is satisfied without it. The popover renders from the run store, not from the surface
that started the run, so closing the inline menu changes nothing: the run keeps streaming,
its row stays, and Stop still works. That behaviour is what the tests assert (an
`inline`-kind run is an ordinary row, with no special casing) — not a label.

W1 follow-ups recorded for the orchestrator, not solved here:

- the "run detached" sub-line, once a real producer for it exists;
- the mockup's `agent · running write_note` sub-line, which needs live tool state.
  `RunEvent` carries `tool_start` / `tool_end` so the store sees it, but surfacing it needs
  a new `RunRecord` field, and contracts are frozen. Rendering `{status} · {kind}` instead.

## 6. Inline-menu Stop

`AssistantStopButton` is the inline-menu control from the mockup header
(`■ Stop  esc`). Whoever owns the inline menu mounts it as:

```svelte
<AssistantStopButton run={active_run} on_stop={on_assistant_stop} hint="esc" />
```

It renders nothing for a terminated run and disables itself while `status === "stopping"`,
so the caller needs no guard of its own. Omit `hint` in denser contexts — the popover rows
already do.

## 7. Test helper added

`tests/unit/helpers/ui_stubs/popover.ts` + `popover_root.svelte` — a stub for
`$lib/components/ui/popover`, following the existing `dialog` / `tooltip` / `select` stub
pattern. bits-ui's real Popover portals through floating-ui and does not mount usefully in
jsdom. New file, no existing export changed.
