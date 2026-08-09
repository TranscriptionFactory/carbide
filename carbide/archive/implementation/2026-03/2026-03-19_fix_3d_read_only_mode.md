---
title: "3D — Read-only view mode"
date: 2026-03-19
status: implemented
bug_ref: "3D"
---

## Problem

No way to view a note without risking accidental edits. Useful for reference panes and presentations.

## Solution

Added `"read_only"` as a fourth `EditorMode` variant. Mode is per-pane, not per-note.

### Mode cycle

Status bar mode toggle now cycles: **Visual → Source → Read-only → Visual**.

### ProseMirror editability

- Added `set_editable?: (editable: boolean) => void` to `EditorSession` port interface
- ProseMirror adapter tracks `is_editable` flag; `set_editable()` calls `view.setProps({ editable: () => is_editable })`
- `EditorService.set_editable()` delegates to session

### Mode transitions

In `editor_toggle_mode` action:

- **visual → source**: existing flush + cursor mapping (unchanged)
- **source → read_only**: sync visual from markdown, call `set_editable(false)`
- **read_only → visual**: call `set_editable(true)`, toggle mode

### Dedicated toggle action

`editor.toggle_read_only` directly enters/exits read_only from any mode:

- From visual/source → flushes/syncs, disables editing, sets `read_only`
- From read_only → re-enables editing, sets `visual`

### UI changes

- Status bar shows "Visual" / "Source" / "Read-only"
- `note_editor.svelte`: visual editor stays visible in read_only mode (hidden only in source mode)
- Read-only state gets `opacity: 0.85` and `cursor: default`
- Command palette: "Toggle Read-only Mode"

### Autosave safety

No guard needed — autosave only triggers when `open_note.is_dirty` is true, which cannot happen when `set_editable(false)` prevents all editing.

### Files changed

- `src/lib/shared/types/editor.ts`
- `src/lib/features/editor/state/editor_store.svelte.ts`
- `src/lib/features/editor/ports.ts`
- `src/lib/features/editor/adapters/prosemirror_adapter.ts`
- `src/lib/features/editor/application/editor_service.ts`
- `src/lib/app/action_registry/action_ids.ts`
- `src/lib/app/orchestration/app_actions.ts`
- `src/lib/features/note/ui/note_editor.svelte`
- `src/lib/features/editor/ui/editor_status_bar.svelte`
- `src/lib/features/search/domain/search_commands.ts`
- `src/lib/features/search/types/command_palette.ts`
- `src/lib/features/search/application/omnibar_actions.ts`
- `tests/unit/stores/editor_store_mode.test.ts`
