# Floating Formatting Toolbar — Synchronicity & State Review

**Commit:** `7a564245` (feat: formatting toolbar for WYSIWYG editor)
**Reviewed:** 2026-04-06
**Scope:** `formatting_toolbar_commands.ts`, `formatting_toolbar_plugin.ts`, `toolbar_extension.ts`, `formatting_toolbar.svelte`

---

## Critical: Stale View Capture in Svelte Mount

**Files:** `toolbar_extension.ts:32-46`

The `mount_toolbar()` function passes the `view` parameter directly into the Svelte `mount()` props **and** into the `on_command` closure:

```ts
function mount_toolbar(view: EditorView) {
  if (svelte_app) return;  // early return if already mounted
  svelte_app = mount(FormattingToolbar, {
    props: {
      view,                              // captured at mount time
      on_command: (command) => {
        toggle_format(command, view);     // same captured view
        view.focus();
      },
    },
  });
}
```

**The problem:** Once the Svelte component is mounted, **both the `view` prop and the `on_command` closure are frozen** to whatever `EditorView` instance existed at mount time. The `toolbar_view` variable in the outer closure gets updated on every ProseMirror update cycle (line 107: `toolbar_view = view`), but the Svelte component never sees the new reference.

This causes two concrete bugs:

1. **`on_command` dispatches to a potentially stale view.** If the view's internal state has been replaced (e.g., buffer switch via `view.updateState()`), the closure still holds the old `view` reference. `toggle_format(command, view)` reads `view.state` and calls `view.dispatch` — these will operate on whatever state the captured view object currently has, which *might* be fine if ProseMirror mutates in place, but creates a fragile coupling to ProseMirror's internal identity guarantees.

2. **`get_active_marks(view)` in the Svelte component reads stale state.** The `$derived` reactive block in `formatting_toolbar.svelte:100` calls `get_active_marks(view)` — but since `view` is a prop set once at mount, this derived value only recomputes when Svelte's reactivity system detects a prop change. **It won't detect ProseMirror state transitions** because ProseMirror mutates `view.state` in-place without creating a new `EditorView` object. The active marks shown will be stale until the component is unmounted and remounted.

**Severity:** High — toolbar shows incorrect active state and may dispatch commands against wrong editor state.

**Fix direction:** Either (a) pass a getter function `() => toolbar_view` instead of the view directly, or (b) unmount/remount the Svelte app on every show cycle (which the current code partially does but guards against with `if (svelte_app) return`).

---

## Critical: Async Positioning Races on Rapid Selection Changes

**File:** `formatting_toolbar_plugin.ts:113-130`

Every `update()` call recreates the anchor and fires an async `compute_floating_position()`:

```ts
if (anchor_el) {
  anchor_el.remove();
  anchor_el = create_anchor(view);        // new anchor from current selection
  document.body.appendChild(anchor_el);
}

void compute_floating_position(anchor_el, toolbar_el, "top").then(({ x, y }) => {
  if (!toolbar_el) return;
  Object.assign(toolbar_el.style, { position: "absolute", left: `${x}px`, top: `${y}px` });
});
```

**The problem:** `compute_floating_position` is async (uses `@floating-ui/dom`'s `computePosition` which measures layout). If the user drags their selection quickly, multiple `update()` calls fire before the first `.then()` resolves. Each call:

1. Removes the old anchor
2. Creates a new anchor at new position
3. Fires positioning that reads `anchor_el` (which is now the *new* one)

The earlier `.then()` callbacks still fire and write to `toolbar_el.style`, but their computed positions were based on a now-removed anchor. The `if (!toolbar_el) return` guard prevents writes after toolbar removal, but does **not** prevent writes from stale computations while the toolbar is still visible.

**Result:** Toolbar jumps to wrong position momentarily, then snaps to correct position when the latest promise resolves. Visual flickering on fast selection drags.

**Severity:** High (UX) — flickering and momentary mis-positioning.

**Fix direction:** Track a monotonically increasing request ID. In the `.then()` callback, check that the current ID matches the one captured in the closure. Discard stale results.

---

## Medium: `setBlockType` Used Incorrectly for Blockquote

**File:** `formatting_toolbar_commands.ts:104-108`

```ts
case "blockquote": {
  const node = get_node_type("blockquote");
  if (!node) return false;
  return setBlockType(node)(state, dispatch);
}
```

`setBlockType` is designed for **textblock** nodes (paragraph, heading, code_block). `blockquote` is a **wrapping** node — it contains other blocks. `setBlockType(blockquote)` will fail silently or produce invalid document structure because blockquote isn't a leaf textblock type.

The correct ProseMirror approach is `wrapIn(blockquote)` from `prosemirror-commands`.

**Severity:** Medium — command silently fails or corrupts document structure.

---

## Medium: List Wrapping Bypasses ProseMirror's List Commands

**File:** `formatting_toolbar_commands.ts:109-139`

The bullet/ordered list commands manually construct list structure:

```ts
const tr = state.tr;
const para = schema.nodes.paragraph.create(null, $from.parent.content);
const list_item = item_node.create(null, para);
const list = list_node.create(null, list_item);
const start = $from.before($from.depth);
const end = $from.after($from.depth);
dispatch(tr.replaceWith(start, end, list));
```

**Problems:**

1. Only wraps the current node at `$from` — ignores the `to` end of a multi-node selection. Selecting across two paragraphs and clicking "bullet list" wraps only the first paragraph.
2. Uses `$from.before($from.depth)` / `$from.after($from.depth)` which targets the parent block. If `$from` is nested (e.g., inside a blockquote > paragraph), this replaces just the paragraph inside the blockquote rather than wrapping correctly.
3. Doesn't use `wrapInList` from `prosemirror-schema-list`, which handles join-adjacent-lists, multi-block wrapping, and schema validation.

**Severity:** Medium — incorrect behavior on multi-block selections and nested contexts.

---

## Medium: `prompt()` Blocks the Event Loop

**File:** `formatting_toolbar_commands.ts:78, 175`

```ts
case "link": {
  const url = prompt("Enter URL:");
  ...
}
case "image": {
  const src = prompt("Enter image path or URL:");
  ...
}
```

`window.prompt()` is synchronous and blocking. While the prompt dialog is open:
- ProseMirror's update cycle is frozen
- The toolbar's backdrop is still in the DOM but non-interactive
- Selection state may change if the user interacts with the editor after dismissing

In a Tauri app, `prompt()` behavior depends on the webview — it may not even render a dialog.

**Severity:** Medium — broken UX in Tauri, blocks event loop in browser.

---

## Low: Anchor Uses `position: fixed` but Toolbar Uses `position: absolute`

**File:** `formatting_toolbar_plugin.ts:47-48, 124-125`

Anchor element:
```ts
anchor.style.cssText = "position:fixed;pointer-events:none;opacity:0;z-index:-1;";
```

Toolbar positioning callback:
```ts
Object.assign(toolbar_el.style, {
  position: "absolute",
  left: `${x}px`,
  top: `${y}px`,
});
```

The anchor is `fixed` (relative to viewport), but the toolbar is `absolute` (relative to its offset parent, which is `document.body` since it's appended there). `computePosition` from `@floating-ui/dom` accounts for this, but the mismatch makes the code fragile — if the toolbar is ever reparented to a scrollable container, positioning breaks silently.

**Severity:** Low — works today, fragile to refactoring.

---

## Low: Svelte `$derived` Reads `view.state` Without Reactive Trigger

**File:** `formatting_toolbar.svelte:100-102`

```ts
const active_marks = $derived(
  view ? get_active_marks(view) : new Set<string>(),
);
```

Svelte's `$derived` tracks reactive dependencies — but `view` is a plain JS object, not a `$state` rune. The derived value will compute once when the component mounts and never recompute, because nothing in Svelte's reactivity graph signals that `view.state.selection` changed.

This means the active mark indicators (bold/italic/etc. highlight state) are frozen at mount time.

**Severity:** Low in isolation (toolbar is unmounted/remounted on hide/show cycles, which partially masks this), but combined with the stale view capture issue above, it means mark state is always one show-cycle behind.

---

## Summary

| # | Issue | Severity | Category |
|---|-------|----------|----------|
| 1 | Stale `view` captured in Svelte mount closure | **High** | Synchronicity |
| 2 | Async positioning races on rapid selection | **High** | Synchronicity |
| 3 | `setBlockType` used for wrapping node (blockquote) | **Medium** | Correctness |
| 4 | Manual list wrapping ignores multi-block selection | **Medium** | Correctness |
| 5 | `prompt()` blocks event loop, broken in Tauri | **Medium** | UX / Platform |
| 6 | Fixed vs absolute position mismatch | **Low** | Fragility |
| 7 | `$derived` on non-reactive view object | **Low** | Reactivity |

Issues 1 and 2 are the synchronicity/state bugs you suspected. Issue 1 is the more dangerous one — it can cause commands to dispatch against stale state, potentially corrupting the document or losing user edits during buffer switches.

---

## Decision: Strip `on_select` Mode, Fix in Place

The `on_select` floating mode is the root cause of both high-severity issues and the two low-severity fragility issues. The `always_show` (sticky) and `always_hide` modes are the only ones needed. Removing `on_select` eliminates the entire floating positioning subsystem — no anchors, no async `compute_floating_position`, no backdrop, no body-appended DOM.

### Recommended Fixes

#### 1. Remove `on_select` and all floating positioning code

**Files:** `formatting_toolbar_plugin.ts`, `toolbar_extension.ts`

Strip from the plugin:
- `create_anchor()` function and `anchor_el` variable
- `backdrop_el` and `create_backdrop()` usage
- `compute_floating_position()` import and all async positioning
- The entire `on_select` branch in `update()` (lines 93–130)
- `remove_floating_toolbar()` — replace with a simple no-op or direct `on_hide()` call
- `Z_FORMATTING_TOOLBAR` import (no longer needed for floating z-index)

Strip from the extension:
- `show_toolbar()` / `hide_toolbar()` toggle lifecycle (the floating show/hide pair)
- The `on_show` / `on_hide` callbacks passed to the plugin factory

The plugin becomes a simple mode switch:
```ts
update(view) {
  const mode = config.toolbar_visibility;
  if (mode === "always_show" && !sticky_mounted) {
    on_sticky_mount(view);
    sticky_mounted = true;
  }
  if (mode !== "always_show" && sticky_mounted) {
    on_sticky_unmount();
    sticky_mounted = false;
  }
}
```

**Resolves:** Issues #1 (partially — stale view still needs fix), #2, #6, #7.

#### 2. Fix stale view capture in Svelte mount

**Files:** `toolbar_extension.ts`, `formatting_toolbar.svelte`

Pass a view getter instead of the view directly:

```ts
// toolbar_extension.ts
function mount_toolbar(get_view: () => EditorView | null) {
  svelte_app = mount(FormattingToolbar, {
    target: container,
    props: {
      get_view,
      on_command: (command: FormattingCommand) => {
        const v = get_view();
        if (!v) return;
        toggle_format(command, v);
        v.focus();
      },
    },
  });
}

// Call site in mount_sticky:
mount_toolbar(() => toolbar_view);
```

In the Svelte component, the `get_view` getter is called on each button click — no stale closure. For active mark display, the component should call `get_view()` inside event handlers rather than relying on `$derived` (which can't track ProseMirror mutations). Alternatively, expose a `state_version` counter prop that the plugin increments on each `update()` to trigger Svelte reactivity.

**Resolves:** Issue #1 fully.

#### 3. Use `wrapIn` for blockquote

**File:** `formatting_toolbar_commands.ts`

Replace:
```ts
case "blockquote": {
  const node = get_node_type("blockquote");
  if (!node) return false;
  return setBlockType(node)(state, dispatch);
}
```

With:
```ts
case "blockquote": {
  const node = get_node_type("blockquote");
  if (!node) return false;
  return wrapIn(node)(state, dispatch);
}
```

Import `wrapIn` from `prosemirror-commands` (already a dependency).

**Resolves:** Issue #3.

#### 4. Use `wrapInList` for list commands

**File:** `formatting_toolbar_commands.ts`

Replace the manual list construction for both `bullet_list` and `ordered_list` with:

```ts
case "bullet_list": {
  const list_node = get_node_type("bullet_list");
  if (!list_node) return false;
  return wrapInList(list_node)(state, dispatch);
}
case "ordered_list": {
  const list_node = get_node_type("ordered_list");
  if (!list_node) return false;
  return wrapInList(list_node)(state, dispatch);
}
```

Import `wrapInList` from `prosemirror-schema-list`. This handles multi-block selection, join-adjacent-lists, and nested context correctly.

**Resolves:** Issue #4.

#### 5. Replace `prompt()` with command event pattern

**File:** `formatting_toolbar_commands.ts`

For `link` and `image` commands, don't collect user input inside `execute_command`. Instead, split into two phases:

1. `execute_command("link", view)` emits intent (e.g., returns a sentinel or calls an `on_input_needed` callback)
2. The toolbar UI shows an inline input field or popover to collect the URL
3. On submit, a second call applies the mark/node with the collected value

For an interim fix before building the inline UI, the commands can be gated behind `is_command_available` returning `false` with a TODO, or the toolbar can omit link/image buttons until the async input flow is built.

**Resolves:** Issue #5.

### Cleanup After Fixes

- Remove `ToolbarVisibility` value `"on_select"` from the `editor_settings` type
- Remove `Z_FORMATTING_TOOLBAR` from `floating_toolbar_utils.ts` if no longer referenced
- Update tests: remove any test cases that assert `on_select` behavior
- The `is_command_available` function for `bullet_list`/`ordered_list` can simplify — `wrapInList` already returns false when inapplicable
