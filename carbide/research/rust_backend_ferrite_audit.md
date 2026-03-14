# Rust Backend Efficiency Audit: Ferrite Patterns in Carbide

> Date: 2026-03-14
> Scope: Assess usage of Ferrite-ported Rust backend patterns and identify unported patterns worth adopting.

## Current state

All planned Ferrite ports (from `carbide/implementation/ferrite_port_plan.md`) are complete:

| Port | Module | Status |
|------|--------|--------|
| Atomic writes | `src-tauri/src/shared/io_utils.rs` | Done |
| Encoding detection | `chardetng` + `encoding_rs` in `io_utils::read_file_to_string` | Done |
| Rope buffer | `ropey` via `ManagedBuffer` in `src-tauri/src/shared/buffer.rs` | Done |
| Generic CLI pipeline | `src-tauri/src/features/pipeline/service.rs` | Done |
| Single instance IPC | `tauri-plugin-single-instance` | Done |

## Issues in existing ports

### 1. Settings service skips `sync_all()` before rename — MEDIUM

`src-tauri/src/features/settings/service.rs:27-31` does a manual atomic write pattern but omits `sync_all()` before the rename. On a crash, the renamed file could be empty or partial because data was not flushed to disk.

```rust
// Current (missing fsync):
std::fs::write(&temporary_path, bytes)?;
std::fs::rename(&temporary_path, path)?;

// Should use:
io_utils::atomic_write(path, bytes)?;
```

The `vault_settings/service.rs` already uses `io_utils::atomic_write` correctly — this is an inconsistency.

### 2. `create_note()` uses direct I/O — LOW

`src-tauri/src/features/notes/service.rs:383-395` uses `OpenOptions::create_new()` + `write_all()`. Since `create_new` guarantees the file does not already exist, there is no risk of corrupting existing data. A mid-write crash would leave a partial new file — low impact for typically small initial markdown content. Acceptable tradeoff for the `AlreadyExists` error path.

### 3. Search indexer reads without encoding detection — LOW

`features/search/service.rs` uses `std::fs::read_to_string()` for indexing, bypassing `io_utils::read_file_to_string()` with encoding detection. Non-UTF-8 files would fail to index silently rather than being decoded.

## What is working well

- `write_note()` flows through `BufferManager` → `save_buffer()` → `atomic_write()`
- `write_vault_file()` and `write_image_asset()` use `atomic_write()`
- `storage.rs` (vaults.json) uses `atomic_write()`
- `vault_settings/service.rs` uses `atomic_write()`
- Encoding detection in `io_utils::read_file_to_string()` is properly implemented
- SQLite search DB uses WAL mode for atomic transactions
- ManagedBuffer integrates correctly with the note write path

## Unported Ferrite patterns

Source: `~/src/KBM_Notes/Ferrite/` (v0.2.7, ~175 Rust files)

### Centralized error type with `ResultExt` — HIGH value

Ferrite's `src/error.rs` (262 lines) implements a typed error enum with `std::error::Error` source chaining and a `ResultExt` trait providing `unwrap_or_warn_default()` for graceful degradation.

Carbide uses raw `String` errors on every Tauri command (`Result<T, String>`). This loses context, makes debugging harder, and prevents structured error handling on the frontend.

```rust
// Ferrite pattern (portable):
pub enum Error {
    Io(io::Error),
    FileWrite { path: PathBuf, source: io::Error },
    ConfigLoad { path: PathBuf, source: Box<dyn std::error::Error + Send + Sync> },
}

pub trait ResultExt<T> {
    fn unwrap_or_warn_default(self, default: T, context: &str) -> T;
}
```

Effort: 1–2 days. Impacts every Tauri command boundary.

### Binary file detection heuristics — MEDIUM value

Ferrite's `src/state.rs:125-168` uses multi-heuristic binary detection:
- Null byte presence (strong binary indicator)
- 8KB sample with non-printable character ratio (>10% = binary)
- Excludes common whitespace (tabs, LF, CR) from counts
- Returns human-readable rejection reasons

Prevents opening binaries in the editor or trying to rope-parse a 50MB `.zip`. Carbide likely relies on extension-only detection.

Effort: half day.

### Cache observability with LRU and statistics — MEDIUM value

Ferrite's `src/markdown/mermaid/cache.rs` (365 lines) implements:
- Blake3 hashing for cache keys
- Intelligent key rounding (font size ×2, width ÷10) to reduce cache misses
- LRU eviction (50 entries default)
- Cache statistics: hits, misses, evictions, hit rate percentage

Portable pattern applicable to graph rendering, diagram preview, or any expensive computation. Carbide has no cache statistics or monitoring framework.

Effort: 1 day per cache consumer.

### Worker thread infrastructure — MEDIUM value

Ferrite's `src/workers/mod.rs` (137 lines) provides a `WorkerHandle` abstraction:
- Uses `std::sync::mpsc` (not tokio) for cross-thread-boundary safety
- Bidirectional channels for command sending and response polling
- Spawns dedicated thread with tokio runtime inside
- Non-blocking from UI thread

Cleaner than ad-hoc async patterns for long-running operations (SSH, database, AI).

Effort: 1–2 days.

### Watcher event filtering — LOW value

Ferrite's `src/workspaces/watcher.rs` (196 lines) wraps `notify` with:
- Path-component filtering (`.git`, `node_modules`, hidden files)
- Enum-based `WorkspaceEvent` (FileCreated, FileModified, FileDeleted, FileRenamed, Error)
- MPSC channel for non-blocking event polling
- Configurable debounce (500ms)

Carbide's watcher already works. This is a robustness improvement, not a gap.

Effort: half day.

### Performance allocator and release profile — LOW value

Ferrite uses `mimalloc` (Windows) / `tikv-jemallocator` (Unix) for reduced heap fragmentation. Release profile uses `lto = "thin"`, `codegen-units = 1`, `panic = "abort"`. Carbide uses `codegen-units = 16` — less aggressive optimization.

Effort: hours to add, needs benchmarking to validate impact.

## Recommendations (priority order)

1. **Fix now**: Replace `settings/service.rs` manual write with `io_utils::atomic_write` (5 min, real data safety gap)
2. **Near-term**: Centralized error type — structured errors improve debugging and enable graceful degradation across the entire backend
3. **Near-term**: Binary detection before opening files in editor/buffer
4. **When relevant**: Cache observability for expensive operations (Mermaid rendering, graph computation)
5. **Optimization phase**: Performance allocator + release profile tuning
