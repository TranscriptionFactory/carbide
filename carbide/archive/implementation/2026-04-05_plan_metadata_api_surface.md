# Metadata API Surface: Obsidian-like Parity

Status: In Progress (partial implementation)
Date: 2026-03-31
Last audited: 2026-04-05

## Current State

### What's built and working

**Backend (Rust SQLite — integrated into search index)**

| Layer                    | What                                                                                                               | Location                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `note_properties` table  | YAML frontmatter indexed per-note, type inference (string, number, boolean, date)                                  | `src-tauri/src/features/search/db.rs`          |
| `note_inline_tags` table | Inline `#tag` extraction                                                                                           | same                                           |
| `NoteStats` struct       | word_count, char_count, heading_count, outlink_count, reading_time_secs, task_count/done/todo, next_due_date       | `src-tauri/src/features/search/model.rs:91`    |
| `IndexNoteMeta` struct   | path, title, name, `mtime_ms`, `size_bytes`, file_type, source                                                     | `model.rs:45`                                  |
| `query_bases()`          | Full filter/sort/pagination over properties, tags, stats, meta                                                     | `db.rs:2714`                                   |
| `get_note_properties()`  | BTreeMap of all properties for a path                                                                              | `db.rs:2633`                                   |
| `get_note_tags()`        | Sorted Vec of tags for a note                                                                                      | `db.rs:2652`                                   |
| `list_all_properties()`  | PropertyInfo[] across vault (key, type, count)                                                                     | `db.rs:2688`                                   |
| `list_all_tags()`        | TagInfo[] across vault (tag, count)                                                                                | `db.rs:2663`                                   |
| `get_note_stats()`       | NoteStats for a note                                                                                               | `db.rs:2312`                                   |
| `note_headings` table    | Structured headings (level, text, line) per note, populated during indexing                                        | `db.rs:751` (schema), `db.rs:424` (insert)     |
| `note_links` table       | Schema exists (source_path, target_path, link_text, link_type, section_heading, target_anchor) — **not populated** | `db.rs:760` (schema), `db.rs:809` (migration)  |
| `outlinks` table         | (source_path, target_path) pairs — the actual link storage used during indexing                                    | `db.rs` (used for backlinks, orphan detection) |
| `resolve_note_link`      | Path-arithmetic resolution of `[[path/to/note]]` relative links                                                    | `service.rs:1798`                              |
| `resolve_wiki_link`      | Path-arithmetic resolution of `[[WikiLink]]` style links                                                           | `service.rs:1820`                              |
| `get_orphan_outlinks`    | Identifies unresolved outlinks via LEFT JOIN against `notes` table                                                 | `db.rs:3328`                                   |

**Plugin RPC namespace (`metadata.*`)**

| Method                         | What                        | Permission      |
| ------------------------------ | --------------------------- | --------------- |
| `metadata.query(query)`        | Bases query engine          | `metadata:read` |
| `metadata.list_properties()`   | Vault-wide property listing | `metadata:read` |
| `metadata.get_backlinks(path)` | Incoming links              | `metadata:read` |
| `metadata.get_stats(path)`     | Note statistics             | `metadata:read` |

Dispatched via `plugin_rpc_handler.ts:770-801`.

**Plugin RPC namespace (`search.*`) — metadata-adjacent**

| Method          | What                   | Permission    |
| --------------- | ---------------------- | ------------- |
| `search.tags()` | Vault-wide tag listing | `search:read` |

Backed by `tags_list_all` Tauri command (`service.rs:210`).

**Tauri commands (tag-related)**

| Command                         | What                       | Location         |
| ------------------------------- | -------------------------- | ---------------- |
| `tags_list_all`                 | All tags with counts       | `service.rs:210` |
| `tags_get_notes_for_tag`        | Notes for exact tag match  | `service.rs:219` |
| `tags_get_notes_for_tag_prefix` | Notes for tag prefix match | `service.rs:231` |

**Frontend features**

- Metadata panel — frontmatter property/tag editing (`src/lib/features/metadata/`)
- Bases panel — table/list views, saved query definitions (`src/lib/features/bases/`)

### What's NOT exposed

| Gap                                    | Detail                                                                                                               | Obsidian equivalent                              | Status                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------- |
| No `ctime_ms` / creation date          | Only `mtime_ms` in `IndexNoteMeta`                                                                                   | `TFile.stat.ctime`                               | MISSING                    |
| No composite `getFileCache(path)`      | Need separate `query` + `getStats` + `getBacklinks` calls to assemble full picture                                   | `metadataCache.getFileCache(path)`               | MISSING                    |
| No live cache events                   | No event subscription for metadata index updates                                                                     | `metadataCache.on("changed", cb)`                | MISSING                    |
| Structured headings: no public API     | `note_headings` table is populated, but no Tauri command exposes it; query only used in tests (`db.rs:3237`)         | `fileCache.headings[]`                           | DB DONE, API MISSING       |
| Structured links: table not populated  | `note_links` schema + migration exist but no INSERT during indexing; `outlinks` table used instead (path pairs only) | `fileCache.links[]`, `fileCache.embeds[]`        | SCHEMA ONLY                |
| No resolved/unresolved link map        | `get_orphan_outlinks` does post-hoc LEFT JOIN but no stored resolution status                                        | `metadataCache.resolvedLinks`, `unresolvedLinks` | MISSING                    |
| No `getFirstLinkpathDest()` with index | `resolve_note_link` / `resolve_wiki_link` exist but are path arithmetic only — no vault index lookup                 | `metadataCache.getFirstLinkpathDest()`           | PARTIAL                    |
| Tags not in `metadata` namespace       | Available as `search.tags()`, not `metadata.listTags()`                                                              | `metadataCache.getTags()`                        | DONE (different namespace) |

---

## Target: `getFileCache(path)` shape

The composite per-file cache is the cornerstone of Obsidian plugin compatibility. Target shape:

```ts
interface FileCache {
  frontmatter: Record<string, PropertyValue>;
  tags: CachedTag[]; // { tag: string, position: Position }
  headings: CachedHeading[]; // { level: number, heading: string, position: Position }
  links: CachedLink[]; // { link: string, display: string, position: Position }
  embeds: CachedEmbed[]; // { link: string, display: string, position: Position }
  stats: NoteStats;
  ctime_ms: number;
  mtime_ms: number;
  size_bytes: number;
}
```

Missing pieces (revised):

1. ~~Structured headings (text + level + position) — currently only counted~~ **DB table exists and is populated.** Need: Tauri command + line→Position mapping
2. Structured links (target + display + position) — `note_links` schema exists but is never populated during indexing. `outlinks` stores path pairs only
3. `ctime_ms` — not captured by Rust backend at all
4. Embeds vs links distinction — `note_links.link_type` column exists in schema but not populated

---

## Implementation Plan

### Phase A: Backend enrichment (Rust)

**A1. Capture `ctime_ms` in file metadata**

- Add `ctime_ms` field to `IndexNoteMeta`
- Populate from `fs::metadata().created()` during indexing
- Add column to search DB schema (`notes` table)
- Propagate to `NoteMeta` on frontend

**A2. Expose structured headings via Tauri command** _(reduced scope — DB already done)_

- ~~New table: `note_headings`~~ Table exists and is populated (`db.rs:751`, `db.rs:424`)
- ~~Extract during content parsing~~ Already happens during `upsert_note`
- Add `get_note_headings(vault_id, path)` Tauri command (query at `db.rs:3237` already works, just needs a public command wrapper)

**A3. Populate `note_links` table during indexing**

- `note_links` schema already exists (`db.rs:760`) with columns: `source_path`, `target_path`, `link_text`, `link_type`, `section_heading`, `target_anchor`
- Add `INSERT INTO note_links` during content parsing in `upsert_note` (outlinks are already extracted for the `outlinks` table — extend that pass)
- Populate `link_type` to distinguish `[[link]]` vs `![[embed]]`
- Add `get_note_links(vault_id, path)` Tauri command
- Consider: migrate `outlinks` usage to `note_links` to avoid dual-table maintenance, or keep `outlinks` as the fast path and `note_links` as the rich version

**A4. Resolved/unresolved link map**

- After full index, cross-reference `note_links.target` against known paths (similar to existing `get_orphan_outlinks` approach at `db.rs:3328`)
- Expose as `get_resolved_links()` / `get_unresolved_links()` or flag on each link row

### Phase B: Composite `getFileCache` endpoint

**B1. New Tauri command: `note_get_file_cache(vault_id, path)`**

- Single call returning the composite `FileCache` shape
- Assembles from existing tables + heading/link tables
- Avoids N+1 round-trips from plugin iframe
- Note: `MetadataTauriAdapter` references a `note_get_metadata` command that doesn't exist in Rust — either implement this as the composite endpoint or clean up the dead reference

**B2. Wire to plugin RPC**

- `metadata.getFileCache(path)` → `note_get_file_cache`
- Permission: `metadata:read`

### Phase C: Live cache events

**C1. Emit metadata change events**

- On note upsert/rename/delete, emit `metadata-changed` event via Tauri event system
- Plugin bridge subscribes and forwards to iframe
- `events.on("metadata-changed", cb)` in plugin SDK

**C2. Vault-wide tag listing via `metadata` namespace** _(reduced scope — already available elsewhere)_

- ~~Wire existing `list_all_tags()` to `metadata.listTags()` RPC method~~ Already wired as `search.tags()` (`plugin_rpc_handler.ts:758`, backed by `tags_list_all`)
- Optional: alias as `metadata.listTags()` for Obsidian API parity. Low priority since functionality exists

### Phase D: Link resolution

**D1. `getFirstLinkpathDest(linkpath, sourcePath)` with vault index lookup**

- `resolve_note_link` and `resolve_wiki_link` exist (`service.rs:1798-1838`) but only do path arithmetic
- Need: actual vault index lookup to match shortnames, handle aliases, and confirm target exists
- Needed for plugins that navigate or render links

### Priority order (revised)

1. **A2** (headings API) — trivial, just a Tauri command wrapper around existing query
2. **A1** (ctime) + **A3** (populate note_links) — backend enrichment, can be done in parallel
3. **C2** — trivial alias if desired, functionality already exists
4. **B1 + B2** — composite endpoint, depends on A1-A3
5. **C1** — live events, independent but lower priority
6. **A4 + D1** — link resolution, most complex, least urgent

### Scope considerations

- ~~Heading/link extraction already happens during indexing~~ Heading extraction is done. Link extraction needs extending: outlink paths are captured but not link text, type, or embed flag.
- `ctime_ms` has platform caveats: Linux `ext4` may not have birth time. macOS/APFS and Windows/NTFS do. Fall back to `mtime_ms` when unavailable.
- Position data (byte offsets / line numbers) is nice-to-have for Obsidian compat but not critical for v1. Headings already store line numbers. Links could defer positions.
- `note_links` vs `outlinks` dual-table question should be resolved in A3 — either consolidate or clearly document the separation.

---

## References

- Plugin system spec: `carbide/archive/plugin_system.md` (Phase 2: MetadataCache Infrastructure, lines 297-305)
- Phase 3 implementation: `carbide/implementation/phase3_metadata_and_bases.md`
- Plugin RPC handler: `src/lib/features/plugin/application/plugin_rpc_handler.ts`
- Plugin context wiring: `src/lib/features/plugin/application/create_app_context.ts`
- Rust models: `src-tauri/src/features/search/model.rs`
- Rust DB queries: `src-tauri/src/features/search/db.rs`
- Plugin howto: `docs/plugin_howto.md` (metadata namespace, lines 144-154, 382-407)
