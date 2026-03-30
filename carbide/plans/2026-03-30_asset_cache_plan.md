# Asset Response Cache + HTTP Cache Headers

**Date:** 2026-03-30
**Status:** Planned
**Motivation:** CPU profiling (`sample` at 1ms) shows WebKit's `WKURLSchemeHandler` forcing all response callbacks through the main thread via `callOnMainRunLoopAndWait`. Every request does synchronous disk I/O with no caching and no HTTP cache headers.

## Problem

All three custom protocol handlers (`carbide-asset`, `carbide-plugin`, `carbide-excalidraw`) in `storage.rs` follow the same pattern: parse URI → validate path → `std::fs::read()` → build response with only Content-Type/Content-Length/CORS headers.

From the profile (1435 samples, pid 48994):

- ~200 samples on active tokio workers blocked waiting to deliver `didReceiveResponse`/`didReceiveData`/`didFinish` through the main run loop
- ~28 samples showing main thread mutex contention in CFRunLoop
- Threads 1061552/1061553 spending ~35-38 samples each in synchronous `open`/`read`/`close`/`stat` syscalls

## Solution

Two layers:

1. **Rust in-memory LRU cache** — eliminates disk I/O on repeated requests
2. **HTTP cache headers + conditional requests** — eliminates WebKit even _making_ the request for known assets

## New file: `src-tauri/src/shared/asset_cache.rs`

### Types

```rust
pub struct CachedAsset {
    pub bytes: Vec<u8>,
    pub mime: String,
    pub etag: String,          // blake3 hex of bytes
    pub content_length: usize,
}

pub enum CachePolicy {
    Immutable,                 // Cache-Control: public, max-age=31536000, immutable
    ModerateLifetime,          // Cache-Control: public, max-age=300
    ShortWithValidation,       // Cache-Control: public, max-age=30
    Skip,                      // Cache-Control: no-store
}
```

All policies except `Skip` include an `ETag` header and support `If-None-Match → 304`.

### Managed state

```rust
pub struct AssetCacheState {
    vault:      Mutex<ObservableCache<String, CachedAsset>>,  // capacity 256
    plugin:     Mutex<ObservableCache<String, CachedAsset>>,  // capacity 64
    excalidraw: Mutex<ObservableCache<String, CachedAsset>>,  // capacity 128
}
```

Three independent mutexes — concurrent vault and excalidraw requests don't contend.

### Cache keys

- vault: `"{vault_id}/{rel_path}"` — enables `invalidate_matching(|k| k.starts_with("vault_id/"))`
- plugin: `"{plugin_id}/{rel_path}"`
- excalidraw: `"{rel_path}"`

### Constants

- `MAX_CACHEABLE_BYTES: usize = 10 * 1024 * 1024` — files over 10 MB served but not cached

### Helper functions

- `compute_etag(bytes: &[u8]) -> String` — blake3 hex
- `check_conditional(req, etag) -> bool` — parses `If-None-Match`, strips quotes, compares
- `build_cached_response(asset, policy, is_304) -> Response<Vec<u8>>` — assembles response with correct headers; 304 returns empty body

### New command

```rust
#[tauri::command]
#[specta::specta]
pub fn invalidate_asset_cache(
    state: State<'_, AssetCacheState>,
    vault_id: String,
    asset_path: String,
) -> Result<(), String>
```

## Modified file: `src-tauri/src/shared/storage.rs`

Each handler gains the same pattern:

```
1. Parse URI → derive cache key
2. Determine CachePolicy for this request type
3. If policy != Skip:
   a. Lock cache → get(key) → unlock
   b. If hit: check_conditional(req, etag)
      → 304 if match, 200 with cached bytes if not
   c. If miss: std::fs::read() (lock NOT held during I/O)
      → compute_etag → build CachedAsset
      → if bytes.len() <= 10MB: lock → insert → unlock
      → build 200 response
4. If policy == Skip:
   → std::fs::read() → build response with no-store header
```

### Per-handler policies

| Handler                     | Variant      | Policy                | Rationale                                |
| --------------------------- | ------------ | --------------------- | ---------------------------------------- |
| `handle_excalidraw_request` | all files    | `Immutable`           | Bundled dist, changes only on app update |
| `handle_plugin_request`     | embedded SDK | `Immutable`           | Compiled into binary                     |
| `handle_plugin_request`     | plugin files | `ModerateLifetime`    | Changes on plugin update                 |
| `handle_asset_request`      | `vault/`     | `ShortWithValidation` | User content, may change                 |
| `handle_asset_request`      | `file/`      | `Skip`                | External paths, unpredictable            |

### Signature change

`handle_plugin_request` gains `&AppHandle` parameter to access managed state. The closure in `app/mod.rs` changes from `|_ctx, req|` to `|ctx, req|` and passes `ctx.app_handle()`.

## Modified file: `src-tauri/src/app/mod.rs`

1. Add `.manage(shared::asset_cache::AssetCacheState::new())` alongside existing `.manage()` calls
2. Update plugin protocol closure to pass `ctx.app_handle()`
3. Add `invalidate_asset_cache` to the invoke handler / specta collector

## Modified file: `src-tauri/src/shared/mod.rs`

Add `pub mod asset_cache;`

## Cache invalidation flow

```
FS change detected
  → watcher thread emits VaultFsEvent::AssetChanged { vault_id, asset_path }
  → frontend receives "vault_fs_event" (existing)
  → frontend calls invalidate_asset_cache(vault_id, asset_path) (new IPC call)
  → Rust: state.vault.lock() → invalidate_matching(prefix) → unlock
```

This matches the existing pattern where the watcher emits to frontend and frontend triggers Rust state updates (same as folder cache invalidation in `notes/service.rs`).

## Lock discipline (critical)

Never hold a cache mutex during disk I/O:

```
lock → get → unlock → [disk read if miss] → lock → insert → unlock
```

Two threads can race on the same miss. Both read the same file, both insert. Second write wins. This is correct because blake3 ETags are content-addressed — both produce identical `CachedAsset` values.

## HTTP headers per policy

| Policy                | Cache-Control                         | ETag | Conditional         |
| --------------------- | ------------------------------------- | ---- | ------------------- |
| `Immutable`           | `public, max-age=31536000, immutable` | yes  | If-None-Match → 304 |
| `ModerateLifetime`    | `public, max-age=300`                 | yes  | If-None-Match → 304 |
| `ShortWithValidation` | `public, max-age=30`                  | yes  | If-None-Match → 304 |
| `Skip`                | `no-store`                            | no   | —                   |

ETag format: `"{blake3_hex}"` (quoted per RFC 7232). Store without quotes internally; wrap when writing header; strip quotes when parsing `If-None-Match`.

## Build sequence

| Phase | What                                                             | Verify                       |
| ----- | ---------------------------------------------------------------- | ---------------------------- |
| 1     | Create `asset_cache.rs` with types + helpers + tests             | `cargo check` + `cargo test` |
| 2     | Wire `AssetCacheState` as managed state in `app/mod.rs`          | `cargo check`                |
| 3     | Integrate into `handle_excalidraw_request` (simplest, immutable) | `cargo check` + manual test  |
| 4     | Integrate into `handle_plugin_request` (signature change)        | `cargo check` + manual test  |
| 5     | Integrate into `handle_asset_request` (vault vs file split)      | `cargo check` + manual test  |
| 6     | Add `invalidate_asset_cache` command + frontend wiring           | `pnpm check` + `cargo check` |

## Tests (in `asset_cache.rs` `#[cfg(test)]` module)

- `compute_etag_deterministic` — same bytes → same hash
- `check_conditional_match` — matching ETag in `If-None-Match` → true
- `check_conditional_mismatch` — different ETag → false
- `check_conditional_no_header` — absent header → false
- `response_immutable_headers` — verify Cache-Control value
- `response_304_empty_body` — 304 has zero-length body + ETag
- `cache_miss_then_hit` — insert then get returns same asset
- `invalidate_prefix` — removes matching keys, preserves others
- `large_file_skips_cache` — >10MB not inserted
- `send_sync_bounds` — compile-time assertion that `AssetCacheState: Send + Sync`

## What this does NOT change

- No new Cargo dependencies (blake3 already present)
- No changes to the watcher itself
- No changes to frontend asset loading code (WebKit handles cache headers transparently)
- The `file://` variant remains uncached (external files)
- No TTL expiry in Rust — WebKit's HTTP cache handles time-based revalidation via `Cache-Control`
