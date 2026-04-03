# Tags UI Panel — Sprint Notes (2026-03-16)

## Problem

Tag infrastructure exists in the backend (note_tags SQLite table, frontmatter tag parsing) but has no frontend browsing surface.

## Solution

Full vertical-slice feature module with Rust Tauri commands, frontend port/store/service/actions/panel, and sidebar integration.

## Changes

### Rust backend

- **`src-tauri/src/features/tags/mod.rs`** (new): Module declaration.
- **`src-tauri/src/features/tags/service.rs`** (new): Two Tauri commands:
  - `tags_list_all(vault_id)` → `Vec<TagInfo>` (tag + count, ordered by count DESC)
  - `tags_get_notes_for_tag(vault_id, tag)` → `Vec<String>` (note paths)
  - Uses `with_read_conn` pattern from search service.
- **`src-tauri/src/features/mod.rs`**: Added `pub mod tags`.
- **`src-tauri/src/app/mod.rs`**: Registered both commands in invoke_handler.

### Frontend feature module (`src/lib/features/tags/`)

- **`types.ts`**: `TagInfo` type.
- **`ports.ts`**: `TagPort` interface.
- **`adapters/tag_tauri_adapter.ts`**: Tauri IPC adapter.
- **`state/tag_store.svelte.ts`**: `$state` class with tags, loading, error, selected_tag, notes_for_tag, search_query. `filtered_tags` getter for search filtering.
- **`application/tag_service.ts`**: `refresh_tags()` and `select_tag(tag)` methods.
- **`application/tag_actions.ts`**: 5 actions — refresh, select, open_note, set_search_query, toggle_panel.
- **`ui/tag_panel.svelte`**: Sidebar panel with tag list, note drill-down, search input, empty states.
- **`index.ts`**: Public entrypoint re-exports.

### DI wiring

- **`src/lib/app/di/app_ports.ts`**: Added `tag: TagPort` to Ports type.
- **`src/lib/app/di/create_app_context.ts`**: Instantiated TagService, registered tag actions.
- **`src/lib/app/bootstrap/create_app_stores.ts`**: Added TagStore.
- **`src/lib/app/create_prod_ports.ts`**: Wired tag adapter.
- **`src/lib/app/action_registry/action_ids.ts`**: Added 5 tag action IDs.

### Sidebar integration

- **`src/lib/app/bootstrap/ui/activity_bar.svelte`**: Tags button (Tag icon) between Tasks and Graph.
- **`src/lib/app/bootstrap/ui/workspace_layout.svelte`**: TagPanel rendering for `sidebar_view === "tags"`.

### Tests

- **`tests/unit/stores/tag_store.test.ts`** (new): 14 tests — initial state, mutations, filtering, reset.
- **`tests/unit/services/tag_service.test.ts`** (new): 9 tests — refresh, select, errors, no-op.

## Design Decisions

- **Read-only browsing**: Tags come from frontmatter — no CRUD needed in the panel. Users edit tags in frontmatter directly.
- **Task panel pattern**: Exact structural precedent for sidebar panel features. Same DI, actions, store, adapter patterns.
- **Auto-refresh**: Panel dispatches `tags.refresh` on mount. Subsequent refreshes happen via index-complete events (note save → re-index → event → refresh).
