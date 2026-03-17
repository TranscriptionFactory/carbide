# Keyboard Shortcut Fixes (#6, #7)

**Date:** 2026-03-16
**Branch:** `fix/keyboard-shortcuts-omnibar-outline`

## Bug #6: Global search omnibar shortcut — VERIFIED WORKING

Investigation confirmed all omnibar shortcuts are properly bound and functional:

| Shortcut | Action | Mode |
| --- | --- | --- |
| `Cmd+Shift+F` | `omnibar_open_all_vaults` | All-vault search |
| `Cmd+O` | `omnibar_open` | Current vault search |
| `Cmd+P` | `omnibar_toggle` | Command palette |

All defined in `src/lib/features/hotkey/domain/default_hotkeys.ts` and wired through `register_omnibar_actions()`. No code change needed — this was a discoverability issue.

## Bug #7: Floating outline panel shortcut — FIXED

### Problem

`Cmd+Shift+O` (`ui_toggle_outline_panel`) always toggled the right-rail context rail outline tab, even when the user had `outline_mode: "floating"` enabled in editor settings. The floating outline had no way to show/hide via keyboard.

### Fix

**`src/lib/app/orchestration/ui_store.svelte.ts`**
- Added `floating_outline_collapsed` state (default `false`)
- Reset to `false` in `set_editor_settings()` when outline mode changes
- Reset on full state reset

**`src/lib/app/orchestration/ui_actions.ts`**
- `ui_toggle_outline_panel` now checks `editor_settings.outline_mode`
- When `"floating"`: toggles `floating_outline_collapsed` (returns early, doesn't touch context rail)
- When `"rail"` (default): existing behavior unchanged

**`src/lib/features/outline/ui/floating_outline.svelte`**
- Added `!stores.ui.floating_outline_collapsed` to visibility condition

### Tests

Added 2 new tests in `tests/unit/actions/register_ui_actions.test.ts`:
- `toggles floating outline collapsed when outline_mode is floating`
- `toggles context rail outline when outline_mode is rail`
