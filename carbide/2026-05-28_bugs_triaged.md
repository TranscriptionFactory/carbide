# Bug & Feature Triage — 2026-05-28

Source: `carbide/2026-05-28_bugs.md`. Items grouped by subsystem; each entry has a short title, description, and (where present) reproduction or instrumentation notes from the raw log.

---

## 1. Search, Query & Navigation

### 1.1 Fuzzy + hierarchical tag search
**Source:** raw #1.
Tag search should match (a) fuzzily (typo / substring tolerant) and (b) hierarchically — querying `#parent` should surface notes tagged with `#parent/child`. Currently neither holds.

### 1.2 Hierarchical heading inclusion in task query
**Source:** raw #3.
Task queries scoped by heading do not currently descend into subheadings. Decide whether subheadings should be implicitly included; if so, expose a flag (`include_subheadings: true|false`) on the query so authors can opt out.

### 1.3 Block / heading query (related to task query)
**Source:** raw #5.
No primitive exists for "give me all hierarchical block headings related to X" (e.g. all headings under DLCM across notes). Options:
- Achievable today via Bases, but ergonomics are poor.
- Preferred: a fuzzy-heading query analogous to task query, possibly delivered as a plugin.

### 1.4 Transclusion requires exact note name + blocks editing
**Source:** raw #5.1.
- Transclusion only fires on a full, exact note name.
- Once it fires, visual mode renders the embed and the line becomes uneditable, forcing a switch to source mode to fix the target.
- Net effect: selecting the right note + heading for a transclusion is very awkward.

Proposed: fuzzy matching / autocompletion in the transclusion syntax, plus a way to edit the transclusion target without leaving visual mode.

### 1.5 Source editor should get suggestion dropdowns
**Source:** raw #5.2.
Open question flagged by the user: should source mode show the same `@`/`[[`/tag suggestion dropdowns as visual mode? Currently it does not, which compounds 1.4 when source mode is the only way to repair a transclusion.

### 1.6 Command palette `@` ranking + link resolution
**Source:** raw #8.
- Ranking of `@`-symbol results in the command palette is off (needs a documented scoring rule — exact prefix > substring > fuzzy, with recency boost).
- Link resolution appears to require a fresh index to succeed. It should fall back to a live search rather than silently failing on stale indexes.

---

## 2. Indexing, Linked Sources & PDFs

### ~~2.1 Linked sources — folder link not surfacing in file tree:~~ DEFER
~~**Source:** raw #6.
A folder added as a linked source does not appear in the file tree. Symlinking the folder instead works, but introduces indexing problems (see 2.2 / 2.3).~~

### 2.2 Symlinked notes: fast reindex but Unicode errors
**Source:** raw #6, #6.2, #12.
Reindexing over symlinked notes is fast, but PDF parsing inside those trees throws Unicode decode errors. Need: capture the failing byte sequences, decide on a replacement strategy (`errors="replace"` vs. proper UTF-8 detection), and surface failures in the log panel instead of crashing the indexer for a single file.

### 2.3 Linked-source indexing is very slow (~20s/paper)
**Source:** raw #6, #6.1, #6.2.
Linked-source ingestion (as opposed to symlinks) is dominated by reference gathering — ~20s per paper. Lifecycle for updates appears partially broken and overlaps with symlink handling. Action items:
- Profile reference gathering; identify the dominant phase (PDF parse, citation extraction, network calls?).
- Audit the update lifecycle for linked sources vs. symlinks — currently they overlap in ways that cause redundant work.
- Cache reference graphs across reindexes when content hash is unchanged.

### 2.4 Link repair on note move/rename — MCP & CLI paths bypass repair
**Source:** raw #9.

A `LinkRepairService` already exists (`src/lib/features/links/application/link_repair_service.ts:27`) and is correctly wired into the in-app paths:
- In-app rename: `note_service.rename_note` → `run_link_repair` (`note_service.ts:428`). ✓
- In-app move (file explorer drag/drop, folder move): `folder_service.move_items` → `run_link_repair` (`folder_service.ts:439`). ✓

The gap is on the **Rust MCP/CLI surface**, where wiring is inconsistent:

| Entry point | File | Calls repair? |
|---|---|---|
| MCP tool `rename_note` | `src-tauri/src/features/mcp/tools/git.rs:191` | yes — via `shared_ops::rename_note_and_update_links` |
| CLI route `cli_rename` | `src-tauri/src/features/mcp/cli_routes.rs:269` | **no** — calls bare `shared_ops::rename_note` |
| CLI route `cli_move` (and MCP move equivalents) | `src-tauri/src/features/mcp/cli_routes.rs:284` | **no** — `shared_ops::move_note` → `notes_service::move_items`, no repair step |

This matches the raw report ("did not work using wikilink and moving note with carbide mcp"): the move path on the MCP/CLI server skips the backlink rewrite that the in-app and `rename_note` MCP tool both perform.

**Fix outline:**
1. Extract the backlink-rewrite block currently inlined in `shared_ops::rename_note_and_update_links` (`shared_ops.rs:563-593`) into a private helper `repair_links_for(app, vault_id, path_map: HashMap<String, String>)`.
2. In `shared_ops::move_note`, after `notes_service::move_items` returns, build the `{old → new}` map from successful results (folder moves yield many entries — keep it a map, not a single pair) and call the helper.
3. Either route `cli_rename` through `rename_note_and_update_links` or delete the bare `shared_ops::rename_note` — there's no reason a CLI rename should silently skip repair.
4. Run `index_port.upsert_note(new_path)` (or equivalent Rust path) before querying backlinks, so a stale index doesn't cause sources to be missed (related to 1.6 / #8).

**Tests to add** (mirror the existing `tests/unit/services/link_repair_service.test.ts` cases on the Rust side):
1. Note A contains `[[B]]`. Move B via MCP `move_note`. Assert A's link resolves to B's new path.
2. Repeat for `[[B|alias]]`, `[[B#heading]]`, markdown `[x](B.md)`, and relative paths.
3. Repeat for forward-links *from* the moved note (B linking out) to confirm B's own links survive its relocation.
4. Folder move with multiple notes — confirm the cascaded `path_map` rewrites every backlink in one pass.

**Risks / open questions:**
- The Rust `search_service::rewrite_note_links` is a parallel implementation of the TS rewriter. Confirm wikilink-variant coverage matches before relying on it for MCP moves; consider a shared fixture file consumed by both test suites.
- Index staleness: backlinks come from `search_db::get_backlinks` — sources not yet indexed will be silently missed. Document this limitation or force a sync-upsert before the query.

---

## 3. Editor — Modes, Marks & Inline Rules

### 3.1 Inconsistent task parsing across note switches
**Source:** raw #7.
Task rendering / parsing changes when the user navigates away from a note and back. Suspect cause: the visual-mode renderer recomputes task state from a different code path than the initial load. Repro by toggling between two notes containing tasks and observing whether checkbox state, indentation, or query results change.

### 3.2 Ghost notes left in content pane on close
**Source:** raw #10.
Closing a note sometimes leaves a "ghost" tab/pane visible. Appears correlated with switching between source and visual modes immediately before closing. Likely a stale view-state entry that isn't cleared by the close handler when mode is in transition.

---

## 4. Note Lifecycle — Save, Sidebar & Tabs

### 4.1 Save-as folder picker drill-down not activating
**Source:** raw #16.
The hierarchical folder picker in the Save-As dialog is not drilling into subfolders. Need to confirm whether the click/keyboard handler is bound at all, or whether expansion fires but the state isn't propagated to the tree component.

### ~~4.2 Sidebar / tab refresh is a no-op~~ DEFER
**Source:** raw #17.
~~Triggering refresh in the sidebar or on the tab bar produces no observable change. Expected behavior to define:
- Sidebar refresh → rescan the workspace, pick up new/removed/renamed files.
- Tab refresh → re-render the active note from disk, dropping any cached editor state.

Decide on these semantics and wire them up; current handler likely either no-ops or runs against a stale store.~~

---

## 5. Code LSP

### 5.1 `code_lsp` hangs starting servers; no opt-out
**Source:** raw #11.
Logs show repeated startup attempts for missing language servers:
```
[2026-05-28][17:40:51][carbide::features::code_lsp::manager][INFO] code_lsp: no server for json: vscode-json-language-server not found on PATH
[2026-05-28][17:40:52][carbide::features::code_lsp::manager][INFO] code_lsp: no server for json: vscode-json-language-server not found on PATH
[2026-05-28][17:41:00][carbide::features::code_lsp::manager][INFO] code_lsp: no server for json: vscode-json-language-server not found on PATH
```
Two issues:
- The manager retries instead of caching the "not found" result for the session.
- There is no user-facing setting to disable `code_lsp` per-language or globally.

Fixes: memoize the PATH lookup per server binary, add `code_lsp.enabled` and `code_lsp.languages` settings, and surface a one-line warning in the log panel instead of an INFO-spam loop.

---

## 6. MCP Server

### 6.1 `create_note` 300s timeout for writing **long (2000 word)** note
**Source:** raw #2.
> Error: MCP server "carbide" tool "create\_note" timed out after 300s

Need to determine whether the work actually completed server-side after the timeout (idempotency / orphaned notes) and what the per-call work breakdown looks like. Hypotheses to test:
- Note creation is blocked on a full reindex before returning.
- Indexer holds a lock that contends with `create_note`.

Mitigations: return as soon as the file is written, push indexing onto a background task with a status handle the client can poll.

---

## 7. ~~UI Components~~ DEFER

~~### 7.1 Log panel — category dropdown only populates "log"
**Source:** raw #14.
The log-panel category dropdown is supposed to surface multiple categories (per-subsystem channels) but only the generic `log` bucket is populated. Likely the writer side is emitting everything under one channel, or the panel reads from a single source instead of fanning out by category. Fix requires:
- Audit emit sites — confirm category metadata is attached.
- Audit the panel store — confirm it groups by category rather than collapsing.

### 7.2 Plugin help / info section
**Source:** raw #15.
Plugins currently have no place to surface help docs / about-info. Add a standard `help` slot (markdown rendered in a side pane) and a per-plugin info section in settings.~~

---

## 8. ~~Auto-generation~~ DEFER

### 8.1 ~~Auto-generate file-tree descriptions/captions~~
~~**Source:** raw #4.
Optional feature: generate short descriptions/captions for files shown in the file tree (e.g., a 1-line summary derived from the note's first heading + body, or an LLM-generated summary). Should be opt-in, cached on disk, and invalidated on content change.~~

---

## Open Questions for the User

1. **2.1 vs 2.3:** Should linked-source folders show up in the file tree at all, or remain a "search/index only" surface? Current confusion between symlink and linked-source semantics suggests one of them is redundant.
2. **3.2:** Confirm whether the single-backtick bug appeared before or after 9b184b82. If after, that commit likely regressed this path.
3. **6.1:** Reproducible? Always 300s on `create_note`, or only when the workspace is large / first-run?
4. **8.1:** Local heuristic (first heading + first paragraph) sufficient, or required to call out to an LLM? The latter has cost + offline implications.
