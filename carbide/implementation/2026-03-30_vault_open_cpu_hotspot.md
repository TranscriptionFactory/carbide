# Vault-Open CPU Hotspot: URI Scheme Handler Fixes

## Problem

Opening a vault causes ~80% CPU on the main thread for several seconds. A `sample` profile taken during vault open shows **67% of active main-thread CPU** inside the WebKit custom URI scheme handler pipeline:

- **179 samples** — WebKit IPC decode of `URLSchemeTaskParameters` (serialization overhead per request, unavoidable)
- **137 samples** — `startURLSchemeTask` executing the Rust handlers synchronously on the main thread
- **69 samples** — actual carbide Rust handler code (I/O, cache lookup, response building)

All 12 tokio worker threads are idle (`_pthread_cond_wait`) during this window. The handlers block the main thread with `std::fs::read()` and `Mutex::lock()` instead of running on the async runtime.

The request burst comes from: plugin iframe loads (index.html + JS + CSS + SDK per plugin), vault asset images in restored documents, and potentially excalidraw if a canvas was last-open.

## Fix 1: Async URI Scheme Handlers

**Impact: highest — eliminates 137 samples (29%) of main-thread blocking**

### Rationale

`register_uri_scheme_protocol` runs the handler closure synchronously on the main (AppKit) thread. Every `std::fs::read()`, `Mutex::lock()`, and `blake3::hash()` inside the handler blocks the UI event loop. Tauri 2.10.3 provides `register_asynchronous_uri_scheme_protocol` which gives a `UriSchemeResponder` callback — the handler can run on any thread and call `responder.respond()` when ready.

The 179 samples of WebKit IPC decode still run on the main thread (that's WebKit internals), but the 137 samples of actual handler execution move to the tokio pool. Net effect: the main thread dispatches the request and returns to processing events immediately.

### Changes

**`src-tauri/src/app/mod.rs`** (lines 275–283)

Replace:

```rust
.register_uri_scheme_protocol("carbide-asset", |ctx, req| {
    shared::storage::handle_asset_request(ctx.app_handle(), req)
})
.register_uri_scheme_protocol("carbide-plugin", |ctx, req| {
    shared::storage::handle_plugin_request(ctx.app_handle(), req)
})
.register_uri_scheme_protocol("carbide-excalidraw", |ctx, req| {
    shared::storage::handle_excalidraw_request(ctx.app_handle(), req)
})
```

With:

```rust
.register_asynchronous_uri_scheme_protocol("carbide-asset", |ctx, req, responder| {
    let app = ctx.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        responder.respond(shared::storage::handle_asset_request(&app, req));
    });
})
.register_asynchronous_uri_scheme_protocol("carbide-plugin", |ctx, req, responder| {
    let app = ctx.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        responder.respond(shared::storage::handle_plugin_request(&app, req));
    });
})
.register_asynchronous_uri_scheme_protocol("carbide-excalidraw", |ctx, req, responder| {
    let app = ctx.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        responder.respond(shared::storage::handle_excalidraw_request(&app, req));
    });
})
```

### Why `spawn_blocking` not `spawn`

The handler functions do synchronous I/O (`std::fs::read`, `Mutex::lock`). `spawn_blocking` runs them on a dedicated thread pool designed for blocking work, avoiding starvation of the tokio async worker threads. The handler signatures don't need to change — they stay `fn(...) -> Response<Vec<u8>>`.

### Safety check

The handlers only access: `AppHandle` (thread-safe, `Send + Sync`), `Mutex<ObservableCache>` (thread-safe), `std::fs` (thread-safe), `mime_guess` (pure). No AppKit or UI calls. Safe to move off main thread.

### Verification

- `pnpm tauri dev` — open vault, open note with images, open canvas, open plugin panel
- Confirm assets still load correctly and 304 responses still work
- Re-run `sample` during vault open — handler samples should no longer appear under the main thread

---

## Fix 2: Defer Plugin Iframe Loading

**Impact: high — eliminates the plugin request burst from the vault-open critical path**

### Rationale

When a vault opens, the plugin lifecycle reactor (`plugin_lifecycle.reactor.svelte.ts:20`) immediately calls `plugin_service.initialize_active_vault()`. This activates all `on_startup` plugins, which populates `active_plugin_ids` in the store. `PluginRuntimeContainer` (mounted eagerly in `workspace_layout.svelte:1020`) iterates these IDs and renders `PluginRuntimeItem` → `PluginIframeHost` → `SandboxedIframe` for each. Every iframe triggers multiple `carbide-plugin://` requests: `index.html`, JS bundle, CSS, `carbide-plugin-api.js` SDK.

This burst competes with the initial vault UI rendering (file tree, restored document, etc.) for main-thread time.

### Changes

**`src/lib/features/plugin/ui/plugin_runtime_container.svelte`**

Gate iframe rendering behind a deferred flag so they mount after the first paint:

```svelte
<script lang="ts">
  import PluginRuntimeItem from "./plugin_runtime_item.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  const { stores, services } = use_app_context();

  const active_ids = $derived(stores.plugin.active_plugin_ids);
  const vault_path = $derived(stores.vault.vault?.path ?? "");

  let ready = $state(false);

  $effect(() => {
    if (active_ids.length > 0 && !ready) {
      requestAnimationFrame(() => {
        ready = true;
      });
    }
  });
</script>

{#if ready}
  {#each active_ids as id (id)}
    <PluginRuntimeItem plugin_id={id} {vault_path} {services} />
  {/each}
{/if}
```

### Why `requestAnimationFrame`

`rAF` fires after the browser has completed the current layout/paint cycle. This guarantees the vault's primary UI (file tree, editor, panels) renders and paints before plugin iframes begin loading. Unlike `setTimeout(0)` which may fire before paint, `rAF` is paint-aligned.

### Alternative considered

Deferring at the reactor level (`plugin_lifecycle.reactor.svelte.ts`) was considered, but that delays plugin activation state — other UI might depend on knowing which plugins are active (e.g., panel entries). Deferring only the iframe rendering is more surgical: plugin state is immediately available, but the expensive iframe loads happen one frame later.

### Verification

- Open vault with 2+ active plugins
- Verify vault UI (file tree, editor) renders before plugin iframes appear
- Verify plugins still function correctly after deferred mount

---

## Fix 3: Lazy-Load Vault Asset Images

**Impact: medium — reduces `carbide-asset://vault/` request count at vault open**

### Rationale

When a document with images is restored on vault open, the ProseMirror image node view (`image_extension.ts:104`) creates `<img>` elements immediately. Each image fires a `carbide-asset://vault/` request. If the document has many images, this creates a burst of requests competing with higher-priority resources.

The browser's native `loading="lazy"` attribute defers image loads until the element is near the viewport. Out-of-viewport images (below the fold) won't request until the user scrolls.

### Changes

**`src/lib/features/editor/extensions/image_extension.ts`** (line 104)

In the `image-block` nodeView factory, add `loading="lazy"` to the created `<img>` element:

```typescript
const img = document.createElement("img");
img.loading = "lazy";
img.alt = String(node.attrs["alt"] || node.attrs["caption"] || "");
```

**`src/lib/features/document/ui/image_viewer.svelte`** — do NOT add `loading="lazy"` here. The image viewer is opened by explicit user action (the image is the entire content), so it should load eagerly.

### Scope

This targets only images inside the ProseMirror editor. Other asset URL usage (PDF viewer, explicit image viewer) should remain eager since those are user-initiated single-resource loads.

### Edge case: small documents

If a document has only 1–2 images all above the fold, `loading="lazy"` may still load them eagerly (browser heuristic). This is fine — no behavioral change for simple documents, benefit only kicks in for image-heavy ones.

### Verification

- Open vault with a note containing 10+ images
- Verify images above the fold load immediately
- Verify images below the fold load only when scrolled into view (inspect network/console)
- Verify image paste dialog preview still works (uses different `<img>`, not affected)

---

## Implementation Order

| Order | Fix                       | Effort  | Main-thread CPU reduction                  |
| ----- | ------------------------- | ------- | ------------------------------------------ |
| 1     | Async URI scheme handlers | ~20 min | ~29% (eliminates handler blocking)         |
| 2     | Defer plugin iframes      | ~10 min | Reduces request burst at vault open        |
| 3     | Lazy-load images          | ~5 min  | Reduces request count for image-heavy docs |

Fix 1 alone addresses the core problem (blocking the main thread). Fixes 2 and 3 reduce the total number of concurrent requests, spreading load over time.

## Out of Scope

- **WebKit IPC decode overhead (179 samples):** This is inside WebKit's `URLSchemeTaskParameters` deserialization. Cannot be reduced without reducing request count (fixes 2, 3 help indirectly).
- **SvelteKit bundle chunk count (57 files):** These go through Tauri's built-in protocol, not our custom handlers. Would require Vite `manualChunks` consolidation — separate effort.
- **Excalidraw cache pre-warming:** Low impact on vault-open specifically; excalidraw only loads if a canvas was last-open. Separate follow-up.
