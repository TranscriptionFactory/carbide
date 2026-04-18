# Graph view crash findings

## Summary

The crash happened while loading the graph view, but the most likely fix is not in the graph renderer.

The strongest codebase finding is that production graph loading builds its graph by reading many notes through the live note buffer path, which is the wrong mechanism and can blow up memory or native state during large graph loads.

## What crashed

The crash report shows:

- main thread crash
- `abort()` called
- WebKit custom scheme / Tauri IPC path active during the crash

That means the app died during native request handling triggered by graph loading, not during canvas rendering.

## Actual production graph path

Production does not use the Tauri graph adapter.

It uses:

- `src/lib/app/create_prod_ports.ts`
  - `const graph = create_graph_remark_adapter(notes);`

So the runtime path is:

- `src/lib/features/graph/ui/graph_tab_view.svelte:55-64`
  - auto triggers vault graph load
- `src/lib/features/graph/application/graph_service.ts:82-108`
  - calls `graph_port.load_vault_graph(vault_id)`
- `src/lib/features/graph/adapters/graph_remark_adapter.ts:40-74`
  - builds a vault index by loading all notes and then reading note contents in batches

## Root problem in code

`graph_remark_adapter` reads note contents like this:

- `src/lib/features/graph/adapters/graph_remark_adapter.ts:52-57`
  - calls `notes_port.read_note(...)` in batches

That is a problem because `read_note` is not a lightweight file read.

On the Rust side:

- `src-tauri/src/features/notes/service.rs:471-490`
  - `read_note(...)` calls `buffer_manager.open_buffer(...)`

And the buffer manager does this:

- `src-tauri/src/shared/buffer.rs:24-43`
  - reads the file
  - constructs a rope
  - inserts it into the global `buffers` map

There is no cleanup in the graph indexing path:

- no `close_buffer`
- no eviction
- no transient read mode

So graph loading is effectively bulk loading many notes into the editor buffer cache just to extract links.

## Why this is likely the fix

Graph loading should not use editor session infrastructure as a bulk file reader.

That creates this bad chain:

graph view load
-> graph adapter reads many notes
-> each read opens and stores a managed buffer
-> buffer cache grows with many ropes and paths
-> native memory / state pressure increases during graph load
-> app aborts on the native side

Even if this is not the only possible crash trigger, it is a real design bug and the strongest fix candidate in the current codebase.

## Best fix

Stop using `read_note` for graph indexing.

Instead, use a raw file read path for graph analysis.

There is already a better native primitive:

- `src-tauri/src/features/notes/service.rs:1575-1589`
  - `read_vault_file(...)`

Recommended change:

1. Add a lightweight port method for raw vault file reads
2. Update `create_graph_remark_adapter` to use raw file reads instead of `read_note`
3. Keep `read_note` only for actual editor or document opening flows

## Minimal fallback fix

If the clean refactor is deferred, a weaker stopgap would be:

- after each graph-related `read_note`, immediately close the corresponding buffer

That is still the wrong design because graph indexing would remain coupled to editor buffer semantics.

## Secondary finding

There is also a graph adapter mismatch in the codebase:

- `src/lib/features/graph/adapters/graph_tauri_adapter.ts`
  - invokes `graph_load_vault_graph`, `graph_load_note_neighborhood`, `graph_invalidate_cache`, `graph_cache_stats`

But the Rust backend currently does not expose a graph feature module or register those commands in:

- `src-tauri/src/features/mod.rs`
- `src-tauri/src/app/mod.rs`

This looks like dead or incomplete code and should be cleaned up, but it is probably not the direct cause of the current crash because production wiring uses `create_graph_remark_adapter(notes)`.

## Conclusion

Most likely fix:

Replace graph indexing's use of `read_note` with a raw file read path.

That is the strongest concrete fix candidate supported by the current codebase.
