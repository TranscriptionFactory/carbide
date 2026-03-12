# Brainstorming: Git-Friendly Database & Settings Sync

This document explores strategies to make Carbide's internal storage (`search.db` and `.otterly` files) more robust for synchronization via Git, especially across multiple machines.

## Current Problem
- **Binary Database Conflicts**: `search.db` is a SQLite database. Even minor changes to markdown files trigger database updates. Git treats this as a binary file, leading to frequent merge conflicts and repository bloat.
- **Machine-Specific State**: Files like `settings.json` track open tabs and recent files. These are often specific to a single session/machine. Syncing them via Git causes noise and unnecessary conflicts.
- **Corruption Risk**: Syncing an active SQLite database (with `.db-wal` or `.db-shm` files) can lead to corruption if the main file is updated while the temporary files are in an inconsistent state.

---

## Strategy 1: Git-Ignore the Database
Since `search.db` is entirely derived from the Markdown files in the vault, it can be treated as a cache rather than primary source of truth.

- **Approach**: Add `.otterly/search.db` to `.gitignore`.
- **Pros**: Zero merge conflicts; smaller repository size; no binary diffs.
- **Cons**: Initial indexing delay on a new machine; search is unavailable until indexing completes.
- **Mitigation**: Optimize indexing speed (multi-threaded, incremental) so the delay is negligible for small-to-medium vaults.

## Strategy 2: Text-Based Sidecars for Indexing
Instead of one monolithic binary database, store indexing metadata in small, git-friendly text files.

- **Approach**: For every `note.md`, store a corresponding `note.carbide.json` (or similar) in a hidden directory.
- **Pros**: Git handles text merges natively; clear provenance of changes.
- **Cons**: High file count (doubles the number of files in the hidden directory); slower to query than SQLite.
- **Hybrid**: Keep the SQLite DB for fast local querying, but use the text files as the "source of truth" for sync. Rebuild SQLite from text files on boot if out of sync.

## Strategy 3: Canonical SQL Dump
Bridge the gap between SQLite performance and Git friendliness by using a text representation for commits.

- **Approach**:
  - **Pre-commit**: Automatically dump the SQLite DB to a canonical SQL script or JSON file (`search_index.sql`).
  - **Post-checkout/merge**: Rebuild `search.db` from the SQL script.
- **Pros**: Full search state is preserved in Git; diffs are human-readable.
- **Cons**: Adds overhead to Git operations; large SQL files for large vaults.

## Strategy 4: Splitting State (Global vs. Local)
Separate settings that should be synced from those that should stay local to a machine.

- **Shared State (`.otterly/vault_settings.json`)**:
  - Starred paths
  - Folder-specific icons/colors
  - Plugin configurations
  - Excluded folders
- **Local State (`.otterly/local_state.json` - Git-ignored)**:
  - Open tabs
  - Active tab / cursor position
  - Recent files list
  - Window dimensions
  - Last-used search queries

---

## Review of Current Implementation (Otterly)

### 1. Indexing Triggers
- **On Vault Open**: Otterly triggers a `sync_index` operation when a vault is opened or switched.
- **Reactive (Watcher)**: A file watcher (`WatcherService`) monitors the filesystem. When a `.md` file is added, removed, or changed, it emits an event.
- **Debounced Reconciliation**: The `watcher.reactor` listens to these events and schedules a `reconcile_workspace` task with `sync_index: true`, debounced by **300ms**. This ensures the index stays up-to-date without overwhelming the CPU during heavy file operations.

### 2. Synchronization Logic (`sync_index`)
- **Manifest Comparison**: The `sync_index` function compares the set of markdown files on disk with a manifest stored in the database.
- **Change Detection**: It identifies added, modified (via mtime/size check), and removed files.
- **Incremental Updates**: Only changed files are re-indexed. This is efficient for large vaults with infrequent changes.
- **Batched Transactions**: Updates are processed in batches (currently size 50) and wrapped in SQLite transactions (`BEGIN IMMEDIATE` / `COMMIT`) for performance and integrity.

### 3. Database Schema & Search
- **FTS5 Integration**: Full-text search is powered by SQLite's FTS5 extension using the `unicode61` tokenizer.
- **Metadata Storage**: Separate tables (`notes`, `outlinks`) store structured metadata, file paths, and link relationships.
- **Link Resolution**: Indexing includes extracting and resolving internal links, which supports backlinks and "planned" link suggestions (links to notes that don't exist yet).

### 4. Technical Constraints
- **Single-Threaded Writes**: SQLite write operations are serialized through a single background worker per vault to prevent locking issues.
- **WAL Mode**: Currently uses WAL mode (implicit in many SQLite configurations), which creates `.db-wal` and `.db-shm` files. These are the primary source of corruption and sync noise in Git/Dropbox/iCloud environments.

---

## Implementation Ideas for SQLite Sync Safety

### 1. Disable WAL Mode for Sync
WAL (Write-Ahead Logging) uses sidecar files (`.db-wal`) which are extremely difficult to sync via Git.
- **Proposal**: Switch to `JOURNAL_MODE = DELETE` or `TRUNCATE` when closing the app to ensure all data is flushed into the main `.db` file before a Git operation.

### 2. SQLite Session Extension
Use SQLite's [Session Extension](https://www.sqlite.org/sessionintro.html) to record changes and store them as binary patches. 
- **Pros**: Extremely efficient for small changes.
- **Cons**: Requires custom merge logic; complex implementation.

### 3. Custom Git Merge Driver
Register a custom merge driver in `.gitconfig` for `*.db` files.
- **How**: The driver would use a SQLite-aware tool to merge rows from the two versions of the database.

---

## Recommended Path for Carbide

1. **Immediate**: Split `settings.json` into `vault_settings.json` (tracked) and `local_state.json` (ignored).
2. **Short-term**: Git-ignore `search.db` but implement a very fast incremental indexer that runs on startup.
3. **Long-term**: If search persistence is critical across machines, implement a "Canonical SQL Dump" that only triggers during Git staging/commit.
