# Memory Leak: Find-in-File / Omnifind (~28GB)

**Date:** 2026-04-05
**Status:** Root cause identified, fixes proposed
**Evidence:** `carbide/process_samples/2026-04-05_*`

## Symptoms

- 28GB physical footprint (4.3GB resident, ~25GB swapped) after 48 min of usage
- ~500K resource loads through `WebURLSchemeHandler` (schemeHandler=3)
- WebContent process only 832-858MB — leak is in the main Tauri process
- Memory pressure event at 09:49:59 with `res+swap = 29.7GB`
- `runJavaScriptInFrameInScriptWorld` firing rapidly with 2-4 resource loads per call

## Root Cause

A **cascading amplification** between the frontend find-in-file implementation and the backend asset serving layer.

### 1. No debounce on find-in-file (PRIMARY)

`src/lib/features/search/application/find_in_file_actions.ts:38-46`

```typescript
function update_query(query: string) {
  update_find_state({ query, selected_match_index: 0 });
  const markdown = stores.editor.open_note?.markdown ?? "";
  const matches = services.search.search_within_file(markdown, query);
  stores.search.set_in_file_matches(matches);
}
```

Every keystroke fires `update_query` **synchronously** with zero debounce. The omnibar has a 150ms debounce (`OMNIBAR_SEARCH_DEBOUNCE_MS = 150` in `omnibar_actions.ts:312`). Find-in-file has none.

### 2. Double document scan per keystroke

Each keystroke triggers **two independent full-document scans**:

| Scan                   | Location                      | Mechanism                                                 | Triggered by                                                             |
| ---------------------- | ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `search_within_file()` | `find_in_file_actions.ts:44`  | `String.indexOf` over raw markdown lines                  | Action handler directly                                                  |
| `find_text_matches()`  | `find_highlight_plugin.ts:97` | `RegExp.exec` + `doc.descendants()` over ProseMirror tree | Reactor → `editor_service.update_find_state()` → ProseMirror transaction |

The **reactor** (`find_in_file.reactor.svelte.ts:10-20`) watches `ui_store.find_in_file.{open, query, selected_match_index}` and `editor_store.session_revision`. When the action handler updates `query` and `selected_match_index`, the reactor fires and dispatches a ProseMirror transaction that triggers the second scan.

### 3. DOM re-renders trigger asset re-requests

Each ProseMirror transaction rebuilds the `DecorationSet` (find highlight decorations), causing DOM mutations. If the document contains embedded images served via `carbide-asset://`, the WebView re-requests them on each re-render. This is the source of the ~500K resource loads.

### 4. Response body copy chain amplifies memory

Each asset request goes through:

1. **`asset.bytes.to_vec()`** (`asset_cache.rs:106`) — full copy from `Arc<[u8]>` cache to `Vec<u8>` response body
2. **`NSData::initWithBytes_length`** (`url_scheme_handler.rs:287-294`) — another full copy for WebKit

Two copies of each asset exist simultaneously until the Rust response drops. At ~500K requests with even modest average asset sizes, this creates massive transient allocation pressure that the macOS allocator doesn't reclaim.

### 5. `file` namespace has no caching

`src-tauri/src/shared/storage.rs:487-520`

The `carbide-asset://file/...` namespace uses `build_skip_response` with `Cache-Control: no-store`. No etag, no 304 support. Every request re-reads from disk and allocates a fresh `Vec<u8>`. If inline images use this namespace, they bypass the cache entirely.

## What's NOT leaking (confirmed safe)

| Component               | Location                          | Why it's bounded                                           |
| ----------------------- | --------------------------------- | ---------------------------------------------------------- |
| Asset cache             | `asset_cache.rs:42-48`            | 224MB max (128 + 64 + 32) with byte-aware LRU              |
| BufferManager           | `buffer.rs:8`                     | 20 buffer cap with LRU eviction                            |
| `WEBVIEW_STATE`         | `wkwebview/mod.rs:109`            | Bounded by webview count, cleaned on drop                  |
| DecorationSet           | `find_highlight_plugin.ts:98-104` | Replaced (not accumulated) on each update                  |
| `in_file_matches` store | `search_store.svelte.ts:63`       | Replaced wholesale, not appended                           |
| `session_revision`      | Editor store                      | Only changes on session mount/unmount, not on transactions |

## Fixes

### Fix 1: Add debounce to find-in-file [HIGH IMPACT]

**File:** `src/lib/features/search/application/find_in_file_actions.ts`

Add a 100ms debounce to `update_query`, matching the omnibar pattern. Update UI state immediately (for responsiveness) but debounce the search and ProseMirror update.

```typescript
let find_debounce_timer: ReturnType<typeof setTimeout> | null = null;

function update_query(query: string) {
  update_find_state({ query, selected_match_index: 0 });

  if (find_debounce_timer) clearTimeout(find_debounce_timer);
  find_debounce_timer = setTimeout(() => {
    const markdown = stores.editor.open_note?.markdown ?? "";
    const matches = services.search.search_within_file(markdown, query);
    stores.search.set_in_file_matches(matches);
  }, 100);
}
```

The reactor (`find_in_file.reactor.svelte.ts`) already depends on `ui_store.find_in_file.query`, so it will still fire on immediate state change. But with the search results debounced, the match count / decoration updates will batch naturally.

**Risk:** Low. Only delays match highlighting by 100ms. Query text still updates instantly.

### Fix 2: Eliminate double document scanning [HIGH IMPACT]

**Files:** `find_in_file_actions.ts`, `find_highlight_plugin.ts`, `find_in_file.reactor.svelte.ts`

Two approaches (choose one):

**Option A — Plugin-driven (recommended):** Remove `search_within_file()` from the action handler. Have the ProseMirror plugin's `find_text_matches()` be the single source of truth. After the reactor triggers `update_find_state()`, read back `match_positions` from the plugin state and derive `InFileMatch[]` from it (converting ProseMirror positions to line/column). This eliminates the markdown-level scan entirely.

**Option B — Action-driven:** Compute matches once in the action handler, then pass them to the ProseMirror plugin via transaction meta instead of having the plugin re-search. The plugin would just build decorations from the provided positions.

**Risk:** Medium. Requires coordination between the store (for match count/navigation) and the plugin (for decorations). Option A is cleaner because the ProseMirror plugin already has the document tree.

### Fix 3: Eliminate `to_vec()` copy in asset responses [MEDIUM IMPACT]

**File:** `src-tauri/src/shared/asset_cache.rs:106`

The `build_cached_response` function copies the entire asset from `Arc<[u8]>` to `Vec<u8>` on every 200 response. Two possible approaches:

**Option A — Use `Bytes` crate:** Change response body type to `bytes::Bytes` which can wrap an `Arc<[u8]>` without copying. Requires checking if Tauri's response API accepts `Bytes` or `Cow<[u8]>`.

**Option B — Clone the Arc:** Pass `Arc<[u8]>` through the response chain instead of `Vec<u8>`. The wry layer would need to accept a reference for `NSData::initWithBytes_length` instead of owning the data. This may require patching wry further.

**Option C (minimal) — Ensure 304 responses:** Make sure the frontend sends `If-None-Match` headers on repeat asset requests so cached assets get 304 (empty body) responses. This avoids the copy entirely for cache hits.

**Risk:** Medium-High for A/B (touches Tauri/wry API boundary). Low for C (frontend-only).

### Fix 4: Add caching to `file` namespace [MEDIUM IMPACT]

**File:** `src-tauri/src/shared/storage.rs:487-520`

Route `carbide-asset://file/...` requests through `serve_with_cache()` with `CachePolicy::ShortWithValidation` instead of using `build_skip_response`. This gives etag-based 304 support for repeat requests.

```rust
"file" => {
    // ... existing path resolution ...
    let cache_state = app.state::<AssetCacheState>();
    let cache_key = format!("file/{}", abs.display());
    serve_with_cache(
        &cache_state.vault,  // or a dedicated file cache
        cache_key,
        CachePolicy::ShortWithValidation,
        &req,
        || { /* existing read logic */ },
    )
}
```

**Risk:** Low. Files are already being read; this just avoids re-reading the same file repeatedly.

## Implementation Order

1. **Fix 1** (debounce) — highest impact, lowest risk, stops the cascade
2. **Fix 2** (eliminate double scan) — cuts per-keystroke work in half
3. **Fix 4** (file namespace caching) — reduces backend allocation pressure
4. **Fix 3** (eliminate `to_vec()`) — structural improvement, higher effort

Fixes 1 + 2 together should reduce the ~500K resource loads by 90%+ since most were caused by rapid-fire re-renders from undebounced keystrokes.

## Implementation Plan

**Status:** In progress
**Branch:** `fix/find-in-file-memory-leak`

### Fix 1: Debounce `update_query` — `find_in_file_actions.ts`

Follow the omnibar pattern (`omnibar_actions.ts:312`):

- Closure variable `find_debounce_timer` for pending timeout
- `update_query()`: update UI state immediately (`query`, `selected_match_index: 0`), debounce the `search_within_file()` + store update by 100ms
- Cancel timer on `find_in_file_close`

### Fix 2: Eliminate double scan — Plugin-driven (Option A)

The UI only uses `in_file_matches.length` for count display and button disabling. No individual `InFileMatch` data (line, column, context) is consumed. So we can make the ProseMirror plugin the single source of truth.

**Changes across files:**

| File                                           | Change                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `find_in_file_actions.ts`                      | Remove `search_within_file()` calls from `update_query()` and replace handlers. Action only updates UI state. |
| `prosemirror_adapter.ts` (`update_find_state`) | After dispatching plugin transaction, read `match_positions.length` from plugin state and return it.          |
| `find_in_file.reactor.svelte.ts`               | After `editor_service.update_find_state()`, set match count on search store.                                  |
| `search_store.svelte.ts`                       | Add `find_match_count` reactive state (number).                                                               |
| `find_in_file_bar.svelte`                      | Read `find_match_count` instead of `in_file_matches.length`.                                                  |
| `find_in_file_actions.ts` (navigation)         | `move_selection()` uses `find_match_count` for total.                                                         |

Clean up: remove `search_within_text` import and `in_file_matches` if fully replaced.

### Fix 3 (doc Fix 4): File namespace caching — `storage.rs:487-520`

Route `carbide-asset://file/...` through `serve_with_cache()` with `CachePolicy::ShortWithValidation` instead of `build_skip_response()`. Gives etag-based 304 support for repeat requests.

### Fix 4 (doc Fix 3): Eliminate `to_vec()` copy — DEFERRED

With Fixes 1-3 reducing request volume by 90%+, the remaining copy pressure is manageable. Touches Tauri/wry API boundary. Defer to follow-up.

### Verification

- `pnpm check` / `pnpm lint` / `pnpm test` / `cargo check`
- Manual: rapid typing in find-in-file confirms debounce (highlight delays ~100ms, query text instant)
- Manual: match count displays correctly, next/prev navigation works
- Manual: note with embedded images — no excessive asset requests

### Progress

- [ ] Fix 1: Debounce
- [ ] Fix 2: Eliminate double scan
- [ ] Fix 3: File namespace caching
- [ ] Verification passes
