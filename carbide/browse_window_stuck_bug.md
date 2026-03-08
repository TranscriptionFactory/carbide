# Browse Window "Stuck View" Bug Investigation

## Bug Report

> "When opening a new window, I can only select one document - afterwards, the view is stuck on the first document and doesn't open any other documents."

## Affected Windows

- **BrowseShell** — opened via Cmd+Shift+N (`window_open_browse`) or "Open in New Window" context menu (`window_open_viewer` routes .md files to browse windows)
- AppShell (main window) is NOT affected

## Architecture Context

Each window creates its own independent app context via `create_app_context` in `+page.svelte`:

- Fresh store instances (no singletons) — `create_app_stores.ts`
- Fresh services, ports, action registry
- Reactors mounted per-window via `mount_reactors` (including `editor_sync_reactor`)
- Window type determined by URL params (`parse_window_init`)

### Key Rendering Chain (BrowseShell)

```
browse_shell.svelte
  {#if viewer_state}        ← derived from active_tab (document tabs only)
    <DocumentViewer />
  {:else}
    <NoteEditor />           ← always rendered for note tabs
  {/if}

note_editor.svelte
  {#if active_tab?.kind === "document" && document_viewer_state}
    <DocumentViewer />
  {:else if open_note}
    <div use:mount_editor={open_note} />   ← Svelte action, NO update() method
  {:else}
    "No note open" empty state
  {/if}
```

### Editor Content Switching Mechanism

The `mount_editor` Svelte action only has `mount` and `destroy` — **no `update` callback**. When `open_note` changes from noteA to noteB, the DOM element stays (same `{:else if}` branch), and the action is NOT re-invoked. Content switching is handled entirely by `editor_sync_reactor`.

## Code Flow Analysis

### Flow: First Note Click in Browse Window

1. `note_open` action fires (`note_actions.ts:300-337`)
2. `find_tab_by_path("A")` → null (no tabs yet)
3. `can_open_more_tabs()` → true (0 tabs, max=5)
4. `capture_active_tab_snapshot()` → `active_tab_id` is null → returns immediately
5. `open_note_by_path("A")` → `note_service.open_note("A")`:
   - `should_keep_current_open_note("A")` → false (no current note)
   - `await read_note_for_open(vault_id, "A")` — async I/O
   - `apply_opened_note(docA)` → `editor_store.set_open_note(noteA_state)`
6. `open_note` goes null → noteA → NoteEditor renders editor div
7. `mount_editor` fires → `editor_service.mount({root, note: noteA})` — **async, fire-and-forget via `void`**
8. `editor_sync_reactor` $effect fires:
   - `is_mounted()` → likely **false** (session still being created async)
   - Records `last_note_id = "A"`, `last_buffer_id = "A:..."`, returns early
9. `mount()` completes → `session` is set → but `$effect` does NOT re-run (no tracked dependency changed)
10. First note displays correctly via `mount()` path (not reactor)
11. Tab created: `open_tab("A", title)` → `active_tab_id = "A"`

### Flow: Second Note Click

1. `note_open` action fires
2. `find_tab_by_path("B")` → null
3. `can_open_more_tabs()` → true (1 tab)
4. `capture_active_tab_snapshot()`:
   - `flush()` → gets markdown from session, calls `set_markdown("A", markdown)` → **mutates `open_note`**
   - This triggers `editor_sync_reactor`: same note ID, same buffer_id → `resolve_editor_sync_open` returns false → no action
5. `open_note_by_path("B")` → `note_service.open_note("B")`:
   - `should_keep_current_open_note("B")` → false (current is A)
   - `await read_note_for_open(vault_id, "B")` — async I/O
   - `apply_opened_note(docB)` → `editor_store.set_open_note(noteB_state)`
6. `editor_sync_reactor` $effect fires:
   - `is_mounted()` → **should be true** (session created during first mount)
   - `resolve_editor_sync_open({B, B:..., A, A:...})` → true (different note)
   - `editor_service.open_buffer(noteB, restore_policy)` → should switch content
7. Tab created: `open_tab("B", title)` → `active_tab_id = "B"`

### Conclusion from Static Analysis

**The code flow appears logically correct for both the first and second note clicks.** The second click should work because:

- `is_mounted()` should return true (session was set during first mount)
- `resolve_editor_sync_open` correctly detects the note change
- `open_buffer` properly switches ProseMirror state

## Potential Root Causes (Hypotheses)

### H1: Race Condition in `is_mounted()` (LOW confidence)

`EditorService.session`, `host_root`, and `active_note` are **plain properties, NOT `$state`**. The `$effect` in `editor_sync_reactor` does not track them. If `is_mounted()` returns false for the second click (e.g., if something unmounted between clicks), the reactor would silently skip.

**Why it's unlikely:** The user can take their time clicking the second note. By then, `mount()` has definitely completed and `session` is set. Nothing in the note_open flow unmounts the editor.

### H2: `open_buffer` Silent Failure (MEDIUM confidence)

`EditorService.open_buffer` has an early return:

```typescript
if (!this.host_root || !this.session) return;
```

If `session` is somehow null (e.g., due to an error in a previous operation), `open_buffer` silently returns without switching content. No error is thrown, no warning logged.

### H3: Milkdown `run_editor_action` Error Swallowing (MEDIUM confidence)

The `open_buffer` method in `milkdown_adapter.ts` calls `run_editor_action(ctx => ...)`. If `run_editor_action` catches and swallows errors, the ProseMirror state update could fail silently, leaving the editor stuck on the first note's content.

**Not yet investigated:** The implementation of `run_editor_action`.

### H4: Svelte 5 `$effect.root` Reactivity Edge Case (LOW confidence)

The `editor_sync_reactor` uses `$effect.root` (created outside component context, in `create_app_context`). There may be an edge case in Svelte 5 where `$state` property access through a class instance inside `$effect.root` doesn't establish proper dependencies.

### H5: Tab or UI State Interference (LOW confidence)

Some UI-level issue (CSS, z-index, pointer-events, virtual list re-render) prevents the file tree click from firing on subsequent clicks. Or the vault dashboard opens on mount and blocks interaction.

### H6: Concurrent Action Execution (LOW confidence)

The `ActionRegistry.execute` has no concurrency control. If two actions run concurrently (e.g., `filetree_select_item` and `note_open`), they could interfere. But `filetree_select_item` only sets selection state and shouldn't block `note_open`.

## Key Files

| File                                                        | Purpose                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/lib/app/bootstrap/ui/browse_shell.svelte`              | Browse window shell, renders sidebar + NoteEditor                            |
| `src/lib/features/note/ui/note_editor.svelte`               | Editor component with `use:mount_editor` action                              |
| `src/lib/features/note/application/note_actions.ts`         | `note_open` action (lines 300-337)                                           |
| `src/lib/features/note/application/note_service.ts`         | `NoteService.open_note` (lines 180-241)                                      |
| `src/lib/features/editor/application/editor_service.ts`     | `EditorService` — mount, open_buffer, is_mounted                             |
| `src/lib/reactors/editor_sync.reactor.svelte.ts`            | `$effect` that bridges store changes → editor buffer switches                |
| `src/lib/features/editor/adapters/milkdown_adapter.ts`      | `open_buffer` implementation (lines 643-714)                                 |
| `src/lib/features/document/application/document_actions.ts` | `document_open` action for non-note files                                    |
| `src/lib/features/tab/application/tab_action_helpers.ts`    | `capture_active_tab_snapshot`, `ensure_tab_capacity`, `open_active_tab_note` |
| `src/lib/app/orchestration/app_actions.ts`                  | `execute_app_mounted` — browse window initialization                         |
| `src/routes/+page.svelte`                                   | Entry point, creates app context per window                                  |

## Differences: BrowseShell vs AppShell

| Aspect             | BrowseShell             | AppShell                                            |
| ------------------ | ----------------------- | --------------------------------------------------- |
| Keyboard shortcuts | Only Cmd+W close        | Full `use_keyboard_shortcuts`                       |
| Dialogs            | None                    | `AppShellDialogs` (vault dashboard, settings, etc.) |
| Tab restore        | No (fresh start)        | Yes (from vault settings)                           |
| Layout             | Simple Resizable panels | `WorkspaceLayout` with split view                   |
| File tree data     | `stores.notes.files`    | Via WorkspaceLayout                                 |
| Note selection     | Same `note_open` action | Same `note_open` action                             |

## Next Steps

1. **Add console.log diagnostics** at:
   - `editor_sync_reactor` effect entry (log `open_note.meta.id`, `is_mounted()`, `last_note_id`)
   - `editor_service.open_buffer` entry (log note path, session existence)
   - `note_open` action entry (log note_path)
   - `milkdown_adapter.open_buffer` entry and `run_editor_action` callback
2. **Reproduce** in dev mode and check console output
3. **Investigate `run_editor_action`** for error swallowing
4. **Test** whether clicking tabs (not file tree) also fails to switch content
5. **Test** whether the issue occurs in AppShell or only BrowseShell
