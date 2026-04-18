# Floating Outline Panel

## Assessment: Easy-Medium

This is a well-scoped UI change. The outline data pipeline (ProseMirror plugin → OutlineStore → OutlinePanel) is already clean and decoupled. The work is purely presentation-layer: a new wrapper component that renders `OutlinePanel` in a floating container positioned over the editor, plus UIStore state to toggle between floating and rail modes.

**Estimated scope:** ~3 files changed, ~1 new file, no backend work.

## Current State

- `OutlinePanel` renders heading hierarchy, handles click-to-scroll, tracks active heading via scroll listener
- It lives inside `ContextRail` (right sidebar), which is a resizable pane (12–35% width) in `workspace_layout.svelte`
- `OutlinePanel` is a pure presentational consumer of `OutlineStore` — no coupling to ContextRail's layout
- UIStore owns `context_rail_open`, `context_rail_tab` (ephemeral layout state)

## Architecture Decision (per decision tree)

- **Floating vs rail toggle** → UIStore (ephemeral UI layout)
- **Floating panel position/drag** → component-local `$state` (visual-only)
- **Toggle action** → ActionRegistry entry (user-triggerable)

No new ports, services, reactors, or domain logic needed.

## Implementation Plan

### 1. UIStore: add floating outline state

**File:** `src/lib/app/orchestration/ui_store.svelte.ts`

```ts
outline_mode = $state<"rail" | "floating">("rail");
floating_outline_open = $state(false);

toggle_floating_outline() {
  this.floating_outline_open = !this.floating_outline_open;
}

set_outline_mode(mode: "rail" | "floating") {
  this.outline_mode = mode;
  if (mode === "floating") {
    this.floating_outline_open = true;
  }
}
```

### 2. New component: `floating_outline.svelte`

**File:** `src/lib/features/outline/ui/floating_outline.svelte`

A positioned overlay that wraps the existing `OutlinePanel`:

- `position: absolute; top: var(--space-3); right: var(--space-3);` relative to the editor pane
- Fixed width (~240px), max-height (~60vh), overflow-y auto
- Semi-transparent background (`var(--popover)`) with border, rounded corners, shadow
- Small header bar with title "Outline" and a close button (X icon)
- Optional: drag handle in header for repositioning (component-local `$state` for x/y offset)
- Renders `<OutlinePanel />` as its body — zero duplication
- Conditionally shown: `{#if stores.ui.floating_outline_open && stores.ui.outline_mode === "floating"}`
- Auto-hide when no headings: `{#if stores.outline.headings.length > 0}`

### 3. Mount in editor area

**File:** `src/lib/app/bootstrap/ui/workspace_layout.svelte`

Place `<FloatingOutline />` inside the `SplitViewContainer__primary` div, adjacent to `<NoteEditor />`. The parent already has relative-like positioning from the flex layout, so we either:

- Add `position: relative` to `.SplitViewContainer__primary` (if not already set)
- Place `<FloatingOutline />` as a sibling with `position: absolute`

This keeps the floating outline scoped to the editor viewport, not the whole window.

```svelte
<div class="SplitViewContainer__primary" ...>
  <NoteEditor />
  <FloatingOutline />
</div>
```

### 4. Action registration

**File:** `src/lib/features/outline/application/outline_actions.ts` (or wherever outline actions live)

Register `outline.toggle_floating` action:

- Shortcut: could reuse `Cmd+Shift+O` to cycle (rail → floating → hidden), or add a separate binding
- When floating mode is active, opening context rail outline tab switches back to rail mode

### 5. Context rail integration

When `outline_mode === "floating"`, the outline tab in `ContextRail` could either:

- **(Simple)** Still work as-is — user can have both, outline in rail AND floating. No conflict since they read the same store.
- **(Cleaner)** Show a "Pinned to editor" placeholder in the rail outline tab, with a button to switch back to rail mode.

Recommend the simple approach first.

## Edge Cases

| Scenario           | Behavior                                                                     |
| ------------------ | ---------------------------------------------------------------------------- |
| No headings in doc | Don't render floating panel (or show collapsed indicator)                    |
| Zen mode           | Hide floating outline (same as context rail)                                 |
| Split view active  | Show in active pane only — scope to `.SplitViewContainer__primary`           |
| Window too narrow  | Panel stays within editor bounds via `max-width: 50%` and `overflow: hidden` |
| Theme change       | Uses CSS custom properties, adapts automatically                             |

## What Makes This Easy

1. `OutlinePanel` is already a self-contained component with no ContextRail coupling
2. All data flows through `OutlineStore` which is already wired up
3. No new data pipelines, ports, or services needed
4. The floating container is pure CSS positioning + a thin wrapper component
5. Existing patterns (popover, dialog) provide styling reference

## What Could Add Complexity (Optional Enhancements)

- **Draggable positioning**: Adds ~30 lines of pointer event handling (component-local state, per decision tree). Not required for v1.
- **Resizable floating panel**: Could use a simple drag handle on the edge. Adds moderate complexity.
- **Persist preference**: Saving `outline_mode` to vault settings requires a service call through SettingsPort. Skip for v1 — UIStore default is fine.
- **Transition animations**: Fade/slide in/out with Svelte transitions. Trivial addition.
