# Plan: Add `metadata` RPC Namespace to Plugin System — COMPLETED

> **Status:** Shipped 2026-03-29 in `feat/plugin-gaps-closure`. Implementation differed slightly from plan — used `PluginRpcMetadataBackend` type on the RPC context rather than adding service wrappers, and wired directly through ports in the DI layer. Tags are already accessible via the existing `search.tags` RPC action. See `carbide/implementation/plugin_gaps_closure_plan.md` for details.

## Context

The plugin system (Phase 1a complete) lets plugins register commands, status bar items, and sidebar panels — but plugins **cannot query vault metadata**. The app internally has a rich query engine (`bases_query` with filters, sorts, pagination over frontmatter properties and tags), full-text search, backlinks, and note stats — but none of this is exposed through the plugin RPC.

This blocks any data-driven plugin (calendar view, tag browser, dataview-style tables) from being viable. A plugin wanting calendar data would have to `vault.list()` + `vault.read()` every file and parse frontmatter itself, when the app already has it indexed in SQLite.

**Goal:** Wire the existing query infrastructure into a new `metadata` RPC namespace so plugins can query notes by properties, tags, dates, search, and links.

## Changes

### 1. Backend: Add `list_tags` Tauri command

The only net-new backend query. Tags are stored in `note_tags` but there's no command to list them with counts.

**Files:**

- `src-tauri/src/features/search/db.rs` — add `list_tags(conn) -> Vec<TagCount>` query: `SELECT tag, COUNT(*) as count FROM note_tags GROUP BY tag ORDER BY count DESC`
- `src-tauri/src/features/search/model.rs` — add `TagCount { tag: String, count: i64 }` struct
- `src-tauri/src/features/search/service.rs` — add `#[tauri::command] list_tags(app, vault_id)` command
- `src-tauri/src/app/mod.rs` — register `list_tags` in invoke handler

### 2. Frontend: Extend SearchPort and adapter

**Files:**

- `src/lib/features/search/ports.ts` — add to `SearchPort` interface:
  - `get_note_stats(vault_id, note_path) -> NoteStats`
  - `list_tags(vault_id) -> TagCount[]`
- `src/lib/features/search/adapters/search_tauri_adapter.ts` — implement both via `invoke()`
- `src/lib/features/search/index.ts` — export new types

**New types** (in ports.ts or a shared types file):

```typescript
type NoteStats = {
  word_count: number;
  char_count: number;
  heading_count: number;
  outlink_count: number;
  reading_time_secs: number;
  last_indexed_at: number;
};
type TagCount = { tag: string; count: number };
```

### 3. Service methods for plugin use

The RPC handler calls services, not ports. Need thin wrappers that return data without mutating stores.

**`src/lib/features/search/application/search_service.ts`** — add:

- `plugin_search(vault_id, query, limit?)` — delegates to `search_port.search_notes()`
- `plugin_get_backlinks(vault_id, note_path)` — delegates to `search_port.get_note_links_snapshot()`
- `plugin_get_note_stats(vault_id, note_path)` — delegates to `search_port.get_note_stats()`
- `plugin_list_tags(vault_id)` — delegates to `search_port.list_tags()`

**`src/lib/features/bases/application/bases_service.ts`** — add:

- `query_raw(vault_id, query)` — calls `this.port.query()` directly, no store mutation
- `list_properties_raw(vault_id)` — calls `this.port.list_properties()` directly

### 4. Add `metadata` namespace to PluginRpcHandler

**`src/lib/features/plugin/application/plugin_rpc_handler.ts`** — the primary change:

Add `case "metadata"` to `dispatch()` switch, add `handle_metadata()` private method:

| RPC Method                 | Permission      | Delegates To                                                    |
| -------------------------- | --------------- | --------------------------------------------------------------- |
| `metadata.query`           | `metadata:read` | `services.bases.query_raw(vault_id, params[0])`                 |
| `metadata.list_properties` | `metadata:read` | `services.bases.list_properties_raw(vault_id)`                  |
| `metadata.search`          | `metadata:read` | `services.search.plugin_search(vault_id, params[0], params[1])` |
| `metadata.get_backlinks`   | `metadata:read` | `services.search.plugin_get_backlinks(vault_id, params[0])`     |
| `metadata.get_stats`       | `metadata:read` | `services.search.plugin_get_note_stats(vault_id, params[0])`    |
| `metadata.get_tags`        | `metadata:read` | `services.search.plugin_list_tags(vault_id)`                    |

Vault ID sourced from `this.context.stores.vault` (same pattern as other namespaces using stores).

### 5. Tests

**`tests/unit/services/plugin_rpc_handler.test.ts`** — add `describe("metadata.*")`:

- Each action returns results when `metadata:read` permission is present
- Each action throws when permission is missing
- Throws on unknown action
- Throws when no active vault

## Implementation Order

1. Backend (`list_tags` command) → `cargo check`
2. Extend SearchPort + adapter → `pnpm check`
3. Service wrappers (SearchService + BasesService)
4. RPC handler `metadata` namespace
5. Tests
6. `pnpm check && pnpm lint && pnpm test && cd src-tauri && cargo check && pnpm format`

## Verification

1. `cargo check` passes after backend changes
2. `pnpm check && pnpm lint` pass after frontend changes
3. `pnpm test` passes with new RPC handler tests
4. Manual: could write a small test plugin manifest with `metadata:read` permission and verify RPC dispatch (requires plugin Phase 1b lifecycle to be complete for full e2e)
