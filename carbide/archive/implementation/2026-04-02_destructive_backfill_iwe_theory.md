# Fix: Destructive metadata backfill + IWE LSP restart loop

## Context

Two bugs discovered:

1. **Destructive metadata backfill** (`reference_service.ts:662-678`): The path resolution backfill loop passes a partial `LinkedSourceMeta` (only `external_file_path` + computed relative paths) to `update_linked_metadata`. The Rust SQL `UPDATE` replaces ALL 13 columns, wiping `citekey`, `authors`, `year`, `doi`, `journal`, `abstract`, etc. for every existing note that lacked `vault_relative_path`.

2. **IWE LSP restart loop** (`marksman_lifecycle.reactor.svelte.ts`): Commit eaeba7d7 moved `resolve_iwe_ai_provider(ui_store.editor_settings)` into the first `$effect`'s `do_start()` async body. This call runs synchronously before the first `await`, causing Svelte 5 to track deep reads into `editor_settings.ai_providers` (every array element's `.id`, `.transport.kind`, `.transport.command`). Any mutation to the `editor_settings` object—including property accesses from OTHER effects/components that trigger Svelte's proxy bookkeeping—can re-trigger the effect, causing a stop→config-write→start cycle every ~10-30s. Logs confirm repeated `iwes: starting IWE LSP server` entries.

## Fix 1: Destructive metadata backfill

**File:** `src-tauri/src/features/search/db.rs` — `update_linked_metadata` function (~line 793)

Change the SQL UPDATE to use `COALESCE()` so NULL fields preserve existing values:

```sql
UPDATE notes SET
  citekey = COALESCE(?1, citekey),
  authors = COALESCE(?2, authors),
  ...
  vault_relative_path = COALESCE(?12, vault_relative_path),
  home_relative_path = COALESCE(?13, home_relative_path)
WHERE path = ?14
```

This is the correct fix because:

- `LinkedSourceMeta` fields are all `Option<T>` — `None` means "not provided", not "clear this field"
- Fixes the backfill loop AND the `enrich_dois` loop (same partial-metadata pattern)
- Prevents future callers from accidentally wiping data

**Test:** Update existing test in `db.rs` to verify partial updates preserve existing values.

## Fix 2: IWE LSP restart loop

**File:** `src/lib/reactors/marksman_lifecycle.reactor.svelte.ts`

The problem: `resolve_iwe_ai_provider(ui_store.editor_settings)` is called inside the `do_start()` async function body (before first `await`), causing the `$effect` to track ALL properties accessed during the `.find()` call on `ai_providers` — including deep property reads on every provider element.

**Fix:** Hoist ALL reactive reads into the synchronous effect body as plain values. Pass only primitive/snapshot values into `do_start()`. The async function must NOT read any reactive store.

```ts
$effect(() => {
  const vault_id = vault_store.active_vault_id;
  const is_vault_mode = vault_store.is_vault_mode;
  const enabled = ui_store.editor_settings.marksman_enabled;
  const provider = ui_store.editor_settings.markdown_lsp_provider;
  const custom_path = ui_store.editor_settings.marksman_binary_path;

  // Hoist IWE provider resolution into the synchronous tracking scope
  // so only the specific settings we need are tracked
  const ai_enabled = ui_store.editor_settings.ai_enabled;
  const iwe_provider_id = ui_store.editor_settings.iwe_ai_provider_id;
  const default_provider_id = ui_store.editor_settings.ai_default_provider_id;
  // Snapshot providers as plain array to avoid deep proxy tracking
  const ai_providers = $state.snapshot(ui_store.editor_settings.ai_providers);

  if (!vault_id || !enabled || !is_vault_mode) {
    void marksman_service.stop();
    return;
  }

  // Resolve provider from snapshotted values (no reactive reads)
  const resolved_provider =
    provider === "iwes"
      ? resolve_iwe_ai_provider_from_values(
          ai_enabled,
          ai_providers,
          iwe_provider_id,
          default_provider_id,
        )
      : null;
  const provider_key = resolved_provider
    ? `${resolved_provider.id}:${resolved_provider.model ?? ""}:${resolved_provider.transport.kind === "cli" ? resolved_provider.transport.command : ""}`
    : "";

  const do_start = async () => {
    if (resolved_provider && !is_output_file_provider(resolved_provider)) {
      await marksman_service.iwe_config_rewrite_provider(resolved_provider);
      last_applied_provider_key = provider_key;
    }
    await marksman_service.start(provider, custom_path || undefined);
  };
  // ...
});
```

We need a small helper `resolve_iwe_ai_provider_from_values()` that takes plain values instead of the reactive settings object. OR we can use `$state.snapshot()` on `ai_providers` and pass the snapshot to the existing `resolve_iwe_ai_provider` via a plain settings-like object.

Simplest: use `$state.snapshot(ui_store.editor_settings)` to get a plain copy, then pass that to `resolve_iwe_ai_provider`:

```ts
const settings_snapshot = $state.snapshot(ui_store.editor_settings);
// ... resolve from snapshot in do_start
```

But `$state.snapshot` still triggers reads on the proxy for the top-level properties during the snapshot call. The key insight: the snapshot must happen in the synchronous scope so the effect tracks the right dependencies at the right granularity, and the async body uses only the snapshot.

**Also fix the third `$effect`** with the same pattern — snapshot `editor_settings` before calling `resolve_iwe_ai_provider`.

## Files to modify

1. `src-tauri/src/features/search/db.rs` — COALESCE in `update_linked_metadata`
2. `src/lib/reactors/marksman_lifecycle.reactor.svelte.ts` — hoist reactive reads, snapshot `ai_providers`

## Verification

1. `cd src-tauri && cargo check` — Rust compiles
2. `cd src-tauri && cargo test` — DB tests pass, including new partial-update test
3. `pnpm check` — TypeScript types
4. `pnpm lint && pnpm test` — lint + unit tests
5. Manual: open vault with IWE enabled, confirm only 1 "starting IWE LSP server" log entry (no repeated restarts)
