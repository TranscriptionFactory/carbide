# Fix #3: `.badgerly` folder created in browse/non-vault mode — P0

**Status:** Implemented
**Branch:** `fix/badgerly-browse-mode`

---

## Problem

Opening a folder in browse mode (non-vault) still writes `.badgerly/` directories:

1. `{vault_path}/.badgerly/settings.json` — writes config into the browsed folder (most visible trust violation)
2. `~/.badgerly/local_state/{vault_id}.json` — creates local state files for browse-mode folders
3. `~/.badgerly/caches/vaults/{vault_id}.db` — creates search index DB for browse-mode folders

## Root Cause

The Rust backend command handlers (`set_vault_setting`, `set_local_setting`) and search DB initialization (`ensure_worker` → `open_search_db`) had no vault mode checks. While the frontend had partial guards (reactors check `is_vault_mode` before calling persist), the backend accepted all writes unconditionally. Any code path that bypassed frontend guards would create directories.

Additionally, `local_state_path()` called `create_dir_all` even for **read** operations, meaning simply loading settings in browse mode would create `~/.badgerly/local_state/`.

## Fix

### 1. Backend vault mode guards (vault_settings/service.rs)

Added `vault_mode_for_id()` checks to both `set_vault_setting` and `set_local_setting` commands. In browse mode, these silently return `Ok(())` — no error propagated to frontend, but no directories created.

### 2. Read/write path separation (vault_settings/service.rs)

Split `local_state_path()` into:

- `local_state_path_for_read()` — returns `Option<PathBuf>`, returns `None` if directory doesn't exist (no `create_dir_all`)
- `local_state_path_for_write()` — creates directories on demand

This mirrors the existing `vault_settings_path_for_read` / `vault_settings_path_for_write` pattern.

### 3. Search worker guard (search/service.rs)

Added vault mode check to `ensure_worker()` — returns error "search indexing is not available in browse mode" before opening DB or creating cache directories.

### 4. Vault mode helper (shared/storage.rs)

Added `vault_mode_for_id(app, vault_id) -> Result<VaultMode, String>` to look up a vault's mode from the registry.

## Files Changed

| File                                               | Change                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/shared/storage.rs`                  | Added `vault_mode_for_id()` helper                                                                                   |
| `src-tauri/src/features/vault_settings/service.rs` | Browse mode guards on `set_vault_setting` and `set_local_setting`; split `local_state_path` into read/write variants |
| `src-tauri/src/features/search/service.rs`         | Browse mode guard on `ensure_worker()`                                                                               |
| `src-tauri/src/features/search/db.rs`              | Extracted `db_cache_dir()` helper (structural cleanup)                                                               |

## Defense-in-Depth

The frontend already has guards at several layers:

- `workspace_reconcile.ts` checks `is_vault_mode` before triggering `vault_sync_index`
- Tab, split view, starred, and recent notes persist reactors all check `is_vault_mode`
- `settings_service.ts` checks `is_vault_mode` before calling `set_vault_setting`
- `note_service.ts` checks `is_vault_mode` before certain operations

The backend guards added here ensure no `.badgerly` writes happen even if frontend guards are bypassed.

## What still writes in browse mode

- `~/.badgerly/vaults.json` — the vault **registry** file. This is the app's global config directory and is needed to track which folders have been opened (including browse-mode ones). This is standard app behavior, analogous to `~/Library/Application Support/`.
