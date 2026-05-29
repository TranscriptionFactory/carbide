---
"carbide": major
---

### Features

- **HTML artifacts as first-class vault citizens**: HTML files now reach full parity with PDFs across indexing, rendering, and embedding.
  - `FileCategory::Html` split from `Code`; `.html`/`.htm` classified as attachments on both sides (`ATTACHMENT_EXT_RE`, `ATTACHMENT_EXTENSIONS`) so markdown links create attachment edges instead of phantom outlinks.
  - New `scraper`-based HTML extractor walks the DOM, skips `script`/`style`/`noscript`/`template`, normalizes whitespace, and pulls `title` (or first `h1`) into `meta.title`. FTS now sees visible text instead of class names and inline JS.
  - Three render modes — **Source / Safe / Live** — with per-file / per-folder trust grants persisted under `.carbide/trusted_html.json`. Default-deny: the trust dialog never appears unless the user explicitly clicks Live.
  - `![[file.html]]` transclusion renders inline as a sandboxed Safe-mode iframe (sanitized + no scripts, regardless of the file's own trust level); the existing "Open in tab" affordance is the path to Live mode. `parse_embed_fragment` now returns `{page, height, params}`; `file_embed` schema gained a `params` attr with JSON DOM round-trip. Vault-relative `src`/`href`/`poster` resolved against the embedder's directory; safe-embed CSP allows `carbide-asset:` while keeping `connect-src 'none'`.
  - New `document.paste_html_artifact` action reads HTML from the clipboard, derives a slugged+timestamped filename, writes the file and a `.meta.json` sidecar in the open note's folder, and inserts a `![[…]]` transclusion at the cursor.
  - Provenance banner above the HTML renderer (fed by `DocumentStore.provenance` map and `DocumentService.refresh_provenance`); ✕ button runs `document.clear_provenance`, deleting the sidecar via a new `DocumentPort.delete_file` method wired through the Tauri `delete_vault_file` command.
  - Full documentation in `docs/html_artifacts.md` covering render modes, trust grants, transclusion, paste-from-clipboard, the provenance banner, theme variables, FTS, the security envelope, and known limitations.

- **Omnibar ranking overhaul with recency boost**: The omnibar scoring rule is now a constant table (`OMNIBAR_SCORES`: exact_prefix 1.0 > substring 0.6 > fuzzy 0.3 + recency boost capped at 0.3) applied to every note-producing branch (structured query / hybrid / FTS) via `rank_notes`. `NotesStore` tracks per-note access timestamps in a 24h sliding window (max 16 ts/note). New `find_notes_by_name(vault_id, query, limit)` Tauri command does a bounded vault walk used as a fallback (100ms timeout) so newly created notes that miss the index still resolve.

- **Hierarchical heading scoping in task queries**: `extract_tasks` now maintains a heading stack indexed by depth; each task's section is stored as slash-joined ancestry (`Project A/Subproject B`) instead of just the nearest heading. New `section under <heading>` operator translates to `(section = ? OR section LIKE 'value/%')`, finding tasks at the heading and every descendant. `section is <heading>` aliases exact match. `include_subheadings:false` keyword opts out.

- **Fuzzy + hierarchical tag search**: `score_tag` scores by `max(hierarchical, substring, fuzzy)` — `#parent` matches `#parent/child` at 1.0; substring at 0.6; fuzzy normalized to ≤ 0.95 so it never beats a literal hierarchical hit. `query_solver.resolve_with` falls back to `list_all_tags` + top-5 fuzzy when prefix lookup misses, so typos like `with #prjects` still surface `#projects/carbide` notes.

- **`search_headings` primitive**: New `search_db::search_headings(conn, query, limit)` streams `note_headings`, rebuilds per-note hierarchy stacks inline, and scores headings by the omnibar rule. Returns `HeadingMatch { note_path, level, text, line, heading_path, score }`. Exposed via Tauri command, `SearchPort`, and `SearchService.search_headings_matching` for plugins/callers.

- **Transclusion edit-in-place**: New Pencil button on the `note_embed` toolbar (between collapse and open-in-tab) converts the rendered embed back into editable `![[display_src` text without the closing `]]` so the embed plugin's `appendTransaction` does not immediately re-render. The wiki_suggest dropdown reactivates because `is_embed` is detected from the leading `!`. `build_embed_edit_transaction` is a pure helper covering display_src round-trip, heading-fragment preservation (`folder/note#Heading`), and src→display_src fallback.

- **PDF extraction cache**: Content-addressed cache (`reference::scan_cache::ScanCache`) keyed on blake3 of the file bytes. Cache hits skip the PDF subprocess and `lopdf` metadata pass entirely; `file_path` and `modified_at` re-derived from the live file so cached results survive renames. Cache lives under `~/.carbide/linked_source_cache/` with a `schema_version` field.

### Fixes

- **`code_lsp` PATH lookups memoized**: cached via `LazyLock<Mutex<HashMap>>`; spawn gated on `code_lsp.enabled` / `code_lsp.languages` from settings. One `warn` per missing server instead of an INFO loop every second.

- **Save-As drill-down**: Untrack the query read in `folder_suggest_input.svelte` so the trailing slash and live typing aren't stomped by the value→query mirror; `ArrowRight` now drills into the highlighted folder.

- **Tab close hardening**: `clear_open_note` resets `split_view`; `close_tab_immediate` flushes the editor when closing the active tab, draining pending mode-transition syncs before teardown.

- **Link repair on MCP/CLI move and rename**: Extracted `repair_links_for()` as the canonical helper used by both `rename_note_and_update_links` and the reworked `move_note`. Move now detects folder vs file via metadata, walks the destination to build a per-child `path_map`, and reports `updated_links` over `cli_move` + `cli_rename` JSON responses. `repair_links_for` `index_upserts` each new path before querying backlinks, encoding the writes-complete-first/reads-fall-back policy documented in `shared_ops` module docs.

- **PDF extraction observability**: `warn!(path, cause)` on both the in-process indexer path (`search::text_extractor::extract_content`) and the subprocess-isolated linked-source path (`reference::linked_source::extract_pdf`) — previously `unwrap_or_default()` swallowed errors silently. The in-process `recv_timeout` now distinguishes timeout (parser slow) from disconnect (worker panicked). Added per-stage `Instant` timing around `extract_pdf` (meta/text/ids phases).

- **`create_note` timing audit**: Per-phase debug timing (resolve / pre_write / write / total, plus bytes) added to the MCP `create_note` path so future slow reports have actionable data. End-to-end audit confirmed no synchronous reindex, contended lock, or embedding call on the write path.

- **Task attr consistency across navigate-away-and-back**: In-editor task creation now sets `task_status="todo"` alongside `checked=false` (`block_transforms.ts` × 2 sites, the `wrap_as_todo` loop, and `slash_command_plugin.ts make_todo_insert`). Previously, a freshly created `[ ]` task had `{checked: false, task_status: null}` while the mdast→pm parse path set `{checked: false, task_status: "todo"}` for the same syntax — so the same task clicked behaved differently before vs. after a navigate-away-and-back. Both paths now produce matching attrs.

- **Comment regex tightened in task query parser**: `(?:^|\s)#\s` so `section under #Heading` parses correctly (the leading `#` is no longer eaten as a comment marker).

### Notes

- Source-mode editor keeps LSP completion; wiki/tag/at-palette syntax completion in source mode is a documented gap (lifting the PM suggest factory to CodeMirror primitives would duplicate suggest orchestration; the resolved bias is the LSP fallback).
- A shared link-repair parity fixture at `tests/fixtures/link_repair_cases.json` drives matching tests on both the Rust (`search_service::rewrite_note_links`) and TS (`LinkRepairService`) sides; markdown-link rewriting is pinned as a documented gap so a future fix updates both suites in lockstep.
