# Phase 2: Outline View

## Summary

Added a document outline panel to the right sidebar that displays the heading hierarchy from the currently open note. Users can click headings to scroll to them, collapse sections, and toggle the panel with `Cmd+Shift+O`.

## Architecture

```
outline_plugin.ts (ProseMirror plugin)
  → extracts headings on docChanged via doc.descendants()
  → plugin state compared with headings_equal() to avoid unnecessary updates
  → milkdown_adapter calls on_outline_change callback (debounced 300ms)
    → EditorService wires it to OutlineStore.set_headings()
      → context_rail.svelte renders OutlinePanel

OutlinePanel click → scroll-to-heading
  → action_registry.execute(outline_scroll_to_heading, pos)
    → EditorService.scroll_to_position(pos)
      → view.domAtPos(pos).node.scrollIntoView()
```

## Key Decisions

| Decision                                   | Rationale                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| ProseMirror plugin for extraction          | Follows existing plugin patterns (dirty_state, find_highlight). Runs on every docChanged transaction with equality check to skip no-ops |
| Callback via EditorEventHandlers           | Maintains adapter encapsulation — no ProseMirror view leaked outside the adapter                                                        |
| `Cmd+Shift+O` reassigned from vault change | Vault change dialog is redundant with the Phase 1 dropdown switcher (`Cmd+Shift+V`)                                                     |
| Collapsible sections via Set<string>       | Lightweight — tracked as collapsed heading IDs in OutlineStore, pruned on heading updates                                               |
| DOM-based scroll position tracking         | Queries `h1-h6` elements from `.NoteEditor` container, caches positions, updates via RAF-throttled scroll listener                      |

## Files Created

| File                                                     | Purpose                                                   |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `src/lib/features/outline/types/outline.ts`              | `OutlineHeading` type                                     |
| `src/lib/features/outline/state/outline_store.svelte.ts` | Reactive store (headings, active heading, collapse state) |
| `src/lib/features/outline/ui/outline_panel.svelte`       | Panel UI with collapsible hierarchy                       |
| `src/lib/features/outline/index.ts`                      | Barrel export                                             |
| `src/lib/features/editor/adapters/outline_plugin.ts`     | ProseMirror plugin for heading extraction                 |
| `tests/unit/stores/outline_store.test.ts`                | 7 store tests                                             |
| `tests/unit/adapters/outline_plugin.test.ts`             | 6 heading extraction tests                                |

## Files Modified

| File                                               | Change                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `editor/ports.ts`                                  | Added `on_outline_change` callback, `scroll_to_position` on EditorSession   |
| `editor/adapters/milkdown_adapter.ts`              | Registered plugin, wired debounced callback, implemented scroll_to_position |
| `editor/application/editor_service.ts`             | Wired on_outline_change to OutlineStore, exposed scroll_to_position         |
| `app/bootstrap/create_app_stores.ts`               | Added OutlineStore to AppStores                                             |
| `app/di/create_app_context.ts`                     | Passed outline store to EditorService and action registration               |
| `app/action_registry/action_ids.ts`                | Added `ui_toggle_outline_panel`, `outline_scroll_to_heading`                |
| `app/action_registry/action_registration_input.ts` | Added outline store to stores type                                          |
| `app/orchestration/ui_actions.ts`                  | Registered toggle and scroll actions                                        |
| `app/orchestration/ui_store.svelte.ts`             | Extended ContextRailTab to include "outline"                                |
| `links/ui/context_rail.svelte`                     | Added Outline tab and panel rendering                                       |
| `hotkey/domain/default_hotkeys.ts`                 | Reassigned `Cmd+Shift+O` to outline toggle                                  |
| `vault/application/vault_actions.ts`               | Clear outline store on vault reset                                          |
| `search/` (commands, omnibar, types)               | Added outline toggle to omnibar/command palette                             |
| 7 action test files                                | Added OutlineStore to mock stores                                           |

## Verification

- `pnpm check` — 0 errors, 0 warnings
- `pnpm lint` — 0 errors
- `pnpm test` — 695 passed (1 pre-existing failure in relative_time.test.ts)
- `cargo check` — compiles (no Rust changes)
- `pnpm format` — clean

## Not Covered (requires browser)

- Scroll-to-heading integration test (needs Milkdown + DOM)
- Debounce timing test (needs real ProseMirror transactions)
- Active heading scroll tracking test (needs scroll container)
