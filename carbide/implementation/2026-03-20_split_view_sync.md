# Split View: Real-Time Cross-Pane Content Sync

**Date:** 2026-03-20
**Branch:** `fix/split-view-sync`
**Status:** Implemented

## Problems

Two UX issues when opening the same note in both primary and secondary (split) panes:

1. **Close (X) button disappears on the split note editor** — ProseMirror's absolute-positioned elements (link previews at `z-index: 50`, code lang picker at `z-index: 55`) escape the content container and overlay the header. The header has no stacking context to stay above them.

2. **Edits in one pane are not reflected in the other** — Primary and secondary editors have fully independent `EditorStore` + `EditorService` + ProseMirror sessions. No mechanism propagates content changes between them.

## Root Causes

### Issue 1 — Header z-index

`split_note_editor.svelte`: `.SplitNoteEditor__header` has no `position: relative` or `z-index`. `.SplitNoteEditor__content` has no `position: relative` to contain the absolute-positioned ProseMirror children. When the secondary editor mounts (profile transitions from `"light"` to `"full"`), ProseMirror's floating UI overlaps the header.

### Issue 2 — No cross-pane content sync

Each pane's `on_markdown_change` callback only updates its own `EditorStore.open_note.markdown`. Existing cross-pane code is limited to:

- `propagate_mtime_to_secondary` — mtime only, after saves
- `sync_split_view_session` — one-way secondary→SplitViewStore (no content push)
- `is_same_note_in_both_panes` / `is_inactive_pane_for_same_note` — used to skip saving the inactive pane, no content sync

## Implementation

### Fix 1 — Header z-index (CSS)

**File:** `src/lib/features/split_view/ui/split_note_editor.svelte`

Add stacking context to header and content:

```css
.SplitNoteEditor__header {
  /* existing styles... */
  position: relative;
  z-index: 1;
}

.SplitNoteEditor__content {
  /* existing styles... */
  position: relative;
  z-index: 0;
}
```

### Fix 2 — Real-time content sync

#### Architecture

Two new files following the Domain + Reactor pattern:

1. **`src/lib/features/split_view/domain/content_sync.ts`** — Pure decision logic (testable without Svelte)
2. **`src/lib/reactors/split_view_content_sync.reactor.svelte.ts`** — `$effect.root()` reactor

#### Domain: `content_sync.ts`

**`resolve_content_sync_direction(input)`** — Pure function determining sync direction.

Input:

- `primary_markdown: string`
- `secondary_markdown: string`
- `last_synced_primary: string | null`
- `last_synced_secondary: string | null`

Returns: `{ direction: "primary_to_secondary" | "secondary_to_primary" | "none"; markdown: string }`

Logic:

- If `primary_markdown !== last_synced_primary` and `secondary_markdown === last_synced_secondary` → primary changed, push to secondary
- If `secondary_markdown !== last_synced_secondary` and `primary_markdown === last_synced_primary` → secondary changed, push to primary
- Both changed simultaneously → `"none"` (avoid conflict; autosave resolves)
- Neither changed → `"none"`

All comparisons use `normalize_for_comparison()` to strip trailing whitespace and normalize `\r\n` → `\n`, preventing ProseMirror roundtrip normalization from causing false positives.

**`normalize_for_comparison(markdown: string): string`** — Trims trailing whitespace per line, normalizes line endings. Used only for comparison, never for the actual content pushed.

#### Reactor: `split_view_content_sync.reactor.svelte.ts`

```ts
export function create_split_view_content_sync_reactor(
  editor_store: EditorStore,
  editor_service: EditorService,
  split_view_service: SplitViewService,
  split_view_store: SplitViewStore,
): () => void;
```

**Internal state:**

- `last_synced_primary: string | null` — last markdown read/pushed for primary
- `last_synced_secondary: string | null` — same for secondary
- `sync_in_progress: boolean` — reentrancy guard

**`$effect` body:**

1. Read reactive dependencies: `editor_store.open_note?.markdown`, secondary store's `open_note?.markdown`, `split_view_store.active`
2. Skip if split view inactive or secondary store not available (still in `"light"` profile)
3. Skip if `sync_in_progress`
4. Skip if not same note in both panes (`split_view_service.is_same_note_in_both_panes()`)
5. Call `resolve_content_sync_direction(...)` — if `"none"`, return
6. Schedule debounced sync (150ms) via `create_debounced_task_controller`

**Debounced sync callback — `primary_to_secondary`:**

1. `const cursor_offset = secondary_editor.get_cursor_markdown_offset()`
2. `sync_in_progress = true`
3. `secondary_editor.sync_visual_from_markdown(markdown)` — compares before setting, avoids unnecessary DOM work
4. `secondary_store.set_markdown(note_id, as_markdown_text(markdown))`
5. `secondary_editor.set_cursor_from_markdown_offset(cursor_offset)` — restore cursor
6. Update `last_synced_primary = markdown`, `last_synced_secondary = markdown`
7. `sync_in_progress = false`

**Debounced sync callback — `secondary_to_primary`:**

1. `const cursor_offset = editor_service.get_cursor_markdown_offset()`
2. `sync_in_progress = true`
3. `editor_store.set_markdown(note_id, as_markdown_text(markdown))`
4. If primary is in visual mode: `editor_service.sync_visual_from_markdown(markdown)`
5. Source mode needs no extra call — `source_editor_content.svelte` has a `$effect.pre` that watches `stores.editor.open_note?.markdown` and applies changes to CodeMirror via `sync_source_editor_markdown()` automatically
6. `editor_service.set_cursor_from_markdown_offset(cursor_offset)` — restore cursor
7. Update `last_synced_primary = markdown`, `last_synced_secondary = markdown`
8. `sync_in_progress = false`

#### Loop Prevention — Three Guards

**Guard 1: `sync_in_progress` flag.** Set during callback execution. The `$effect` bails out early when set. Since `set_markdown` on the receiving store triggers the effect again (reactive), the flag prevents scheduling another sync during execution.

**Guard 2: `last_synced_*` bookkeeping.** After every sync, both values are set to the pushed markdown. `resolve_content_sync_direction` returns `"none"` when both current values match their last-synced values. The store is updated with the exact markdown we received (not ProseMirror's roundtrip), so the store value matches `last_synced_*`.

**Guard 3: Normalized comparison.** `normalize_for_comparison` prevents trivial whitespace differences from ProseMirror serialization from registering as content changes.

#### Cursor Preservation

Uses `EditorSession.get_cursor_markdown_offset()` / `set_cursor_from_markdown_offset(offset)` — character-offset based save/restore. Both are already exposed on `EditorService`.

**Known limitation:** If inserted content changes length _before_ the cursor position, the restored offset may be slightly off. Acceptable for v1. A structural-diff cursor mapping would improve this but adds significant complexity.

#### Source Mode Handling

- **Primary edits source → secondary visual:** Source editor writes to `editor_store.open_note.markdown` via `on_markdown_change` (50ms debounce). Reactor reads this, pushes to secondary ProseMirror via `sync_visual_from_markdown`. End-to-end latency: ~200ms.

- **Secondary edits visual → primary source:** Reactor updates `editor_store.set_markdown(...)`. Source editor's `$effect.pre` watches the store and applies via `sync_source_editor_markdown({ content, applied_markdown, next_markdown })`, which compares before dispatching CodeMirror changes. No extra code needed.

#### Wire-up

**File:** `src/lib/reactors/index.ts`

Add to `mount_reactors()`:

```ts
create_split_view_content_sync_reactor(
  context.editor_store,
  context.editor_service,
  context.split_view_service,
  context.split_view_store,
),
```

## File Changes

| File                                                         | Change                               |
| ------------------------------------------------------------ | ------------------------------------ |
| `src/lib/features/split_view/ui/split_note_editor.svelte`    | CSS z-index fix for header + content |
| `src/lib/features/split_view/domain/content_sync.ts`         | **New** — pure sync direction logic  |
| `src/lib/reactors/split_view_content_sync.reactor.svelte.ts` | **New** — content sync reactor       |
| `src/lib/reactors/index.ts`                                  | Import + register reactor            |
| `tests/unit/split_view/content_sync.test.ts`                 | **New** — tests for domain logic     |

## Test Plan

### Unit tests — `content_sync.test.ts`

`resolve_content_sync_direction`:

- Primary changed, secondary unchanged → `primary_to_secondary`
- Secondary changed, primary unchanged → `secondary_to_primary`
- Neither changed → `none`
- Both changed → `none`
- Initial state (both `null` last-synced) with matching markdown → `none`
- Initial state with differing markdown → appropriate direction

`normalize_for_comparison`:

- Trailing newline differences normalized
- Trailing whitespace on lines normalized
- `\r\n` vs `\n` normalized
- Substantive content differences preserved

### Manual verification

- Open same note in both panes → type in primary → secondary updates within ~200ms
- Type in secondary → primary updates
- Cursor stays roughly in place in the non-typing pane
- Switch primary to source mode → type → secondary visual updates
- Type in secondary → primary source editor updates
- Open different notes in each pane → no cross-talk
- Large note (>200KB) → secondary in fallback mode → no errors (sync just updates store, no ProseMirror to push to)

## Risks

1. **ProseMirror `set_markdown` cost for large notes** — Mitigated by 150ms debounce and the existing `large-note-fallback` profile that skips ProseMirror for notes >200KB.

2. **Cursor offset drift on mid-document edits** — Accepted for v1. Offset-based restore is simple and correct when editing at end of document (common case). Structural diff mapping is a v2 improvement.

3. **Race with autosave** — Autosave debounce (2000ms default) >> content sync debounce (150ms). Sync completes and store is consistent well before autosave reads markdown via `flush()`.

4. **Secondary store nullable** — `get_secondary_editor_store()` returns null before first focus (still in `"light"` profile). Reactor guards with null check and skips sync.

## Implementation Notes

**Completed 2026-03-20.**

All five files created/modified as planned:

1. **CSS z-index fix** — Added `position: relative; z-index: 1` to `.SplitNoteEditor__header` and `position: relative; z-index: 0` to `.SplitNoteEditor__content` in `split_note_editor.svelte`.

2. **Domain logic** — `src/lib/features/split_view/domain/content_sync.ts` with `resolve_content_sync_direction` and `normalize_for_comparison`. Exported through feature entrypoint.

3. **Reactor** — `src/lib/reactors/split_view_content_sync.reactor.svelte.ts`. Uses `$effect.root()` + `create_debounced_task_controller` (150ms). Three-layer loop prevention: `sync_in_progress` flag, `last_synced_*` bookkeeping, normalized comparison. Additional guard: skips sync when `secondary_profile !== "full"` (light/fallback modes).

4. **Wire-up** — Registered in `src/lib/reactors/index.ts` via `mount_reactors()`.

5. **Tests** — `tests/unit/domain/content_sync.test.ts`: 12 tests covering all sync direction scenarios + normalization edge cases. All pass.

**Deviation from plan:** Used `NoteId` type casting (`as Parameters<typeof store.set_markdown>[0]`) in the reactor since `payload.note_id` is typed as `string` — avoids importing `NoteId` branded type directly.
