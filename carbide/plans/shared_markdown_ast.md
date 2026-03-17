# Plan: Shared Parsed AST in Rust (`markdown_doc`)

> Source: `carbide/research/market_research_appflowy.md` §16.1
> Status: **Done** (Phase 1 + Phase 2 + Phase 3 complete)

---

## Problem

Every Rust feature that needs document structure parses markdown independently:

| Consumer    | File                    | Parser            | What it extracts                                    |
| ----------- | ----------------------- | ----------------- | --------------------------------------------------- |
| Links       | `search/link_parser.rs` | **Comrak AST**    | Wiki links, markdown links, external links          |
| Frontmatter | `search/frontmatter.rs` | **String + YAML** | Tags, properties                                    |
| Tasks       | `tasks/service.rs`      | **Regex**         | Task items with status, due dates                   |
| Title       | `notes/service.rs`      | **String scan**   | First `# ` heading (reads file from disk again!)    |
| Stats       | `search/db.rs`          | **String ops**    | Word count, char count, heading count, reading time |

During indexing (`rebuild_index` / `sync_index`), a single note triggers:

1. `std::fs::read_to_string()` — read file
2. `extract_title()` — reads first 8KB from disk **again** (redundant I/O)
3. `strip_frontmatter()` — scan for `---` delimiters
4. `extract_frontmatter()` — scan for `---` delimiters **again**, parse YAML
5. String ops for word/char/heading counts
6. `extract_tasks()` — regex scan over full body
7. `internal_link_targets()` → `parse_all_links()` — **full comrak parse**

That's 2 file reads, 2 frontmatter delimiter scans, 1 comrak parse, 1 regex pass, and 3 string scans — all on the same content.

## Solution

A shared `markdown_doc` module that parses a note **once** and returns a `ParsedNote` struct consumed by all features.

### Architecture

```
raw markdown string
        │
        ▼
  parse_note(markdown, source_path)
        │
        ├── extract_frontmatter()     (reuse existing YAML logic)
        ├── strip_frontmatter()       (single pass, cached offset)
        ├── comrak::parse_document()  (single AST parse)
        │       │
        │       ├── walk → headings   (title + heading count)
        │       ├── walk → links      (wiki, markdown, external)
        │       └── walk → text nodes (word count, char count)
        │
        └── extract_tasks()           (regex on body — kept separate, non-standard markers)
        │
        ▼
  ParsedNote {
    frontmatter, body, title,
    headings, links, tasks, stats
  }
```

### Key decisions

1. **Frontmatter stays string+YAML** — comrak's `yaml_metadata_blocks` exists but the current parser is well-tested with 15+ unit tests and handles edge cases. No reason to switch.

2. **Tasks stay regex-based** — The current regex handles non-standard markers (`[/]`, `[-]`) and due date patterns (`📅`, `due:`, `@date`). Comrak's tasklist extension only handles standard `[ ]`/`[x]`. Migrating would lose functionality.

3. **Link rewriting stays in `link_parser.rs`** — `rewrite_links()` needs its own comrak parse with sourcepos for in-place editing. This is a write-path operation, not an indexing operation.

4. **Module location: `shared/markdown_doc.rs`** — consumed by `search/db.rs`, could later be consumed by other features directly. Placed in `shared/` since it's cross-feature infrastructure.

## Implementation

### Phase 1: Create `markdown_doc` module

**New file:** `src-tauri/src/shared/markdown_doc.rs`

```rust
pub struct ParsedNote {
    pub frontmatter: Frontmatter,
    pub body: String,
    pub title: Option<String>,
    pub headings: Vec<Heading>,
    pub links: NoteLinks,
    pub tasks: Vec<Task>,
    pub stats: NoteStats,
}

pub struct Heading {
    pub level: u8,
    pub text: String,
    pub line: usize,
}

pub struct NoteLinks {
    pub wiki_targets: Vec<String>,
    pub markdown_targets: Vec<String>,
    pub external_links: Vec<ExternalLink>,
}

pub struct NoteStats {
    pub word_count: i64,
    pub char_count: i64,
    pub heading_count: i64,
    pub reading_time_secs: i64,
}

pub fn parse_note(markdown: &str, source_path: &str) -> ParsedNote
```

Single function that:

1. Calls `frontmatter::extract_frontmatter()` and `strip_frontmatter()` — reuses existing code
2. Parses body with comrak (same options as `link_parser::markdown_options()`)
3. Single AST walk extracts: headings, links, text content for stats
4. Calls `tasks::extract_tasks()` on the body
5. Returns `ParsedNote`

### Phase 2: Migrate consumers

**`search/db.rs`:**

- `extract_meta()` — remove `extract_title()` call; accept title from `ParsedNote`
- `upsert_note()` — accept `&ParsedNote` instead of raw body; use pre-parsed frontmatter, stats, tasks
- `rebuild_index()` / `sync_index()` — call `parse_note()` once per file, pass `ParsedNote` through
- `extract_link_targets()` — use `ParsedNote.links` instead of calling `internal_link_targets()`

**`search/link_parser.rs`:**

- `internal_link_targets()` — becomes a thin wrapper: `parse_note().links.all_targets()`
- `extract_local_links_snapshot()` — same wrapper pattern
- `rewrite_links()` — **unchanged** (needs its own parse with sourcepos)
- `markdown_options()` — extract to `markdown_doc` as shared config

**`notes/service.rs`:**

- `extract_title()` — keep for standalone use (e.g., file tree display), but indexing no longer calls it

### Phase 3: Shared comrak options

Extract `markdown_options()` from `link_parser.rs` to `markdown_doc.rs`. Both `parse_note()` and `rewrite_links()` use the same options, ensuring consistent parsing behavior.

## Files changed

| File                                           | Change                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src-tauri/src/features/search/markdown_doc.rs` | **New** — `ParsedNote`, `parse_note()`                                                   |
| `src-tauri/src/features/search/mod.rs`          | Add `pub mod markdown_doc;`                                                              |
| `src-tauri/src/features/search/db.rs`          | Refactor `upsert_note`, `extract_meta`, `rebuild_index`, `sync_index` to use `ParsedNote` |
| `src-tauri/src/features/search/link_parser.rs` | Move `markdown_options()` to shared; extraction functions become wrappers                 |
| `src-tauri/src/features/search/frontmatter.rs` | No changes (reused as-is)                                                                 |
| `src-tauri/src/features/tasks/service.rs`      | No changes (called from `parse_note`)                                                     |
| `src-tauri/src/features/notes/service.rs`      | `extract_title()` kept but no longer called during indexing                               |

## Performance impact

- **Indexing**: Eliminates 1 redundant file read + 1 redundant frontmatter scan + consolidates stats computation into AST walk. Net: fewer allocations, single comrak parse serves both link extraction and heading/stats extraction.
- **Memory**: `ParsedNote` is transient (created per-file during indexing, dropped after DB insert). No persistent memory cost.
- **Comrak overhead**: Negligible — comrak was already being called for every file during indexing (via `internal_link_targets`). Now the same parse also yields headings and text stats.

## Testing

- Existing `frontmatter.rs` tests: unchanged
- Existing `link_parser.rs` tests: unchanged (rewrite tests still work)
- New `markdown_doc` tests: `parse_note()` integration tests covering:
  - Frontmatter extraction
  - Title from first H1
  - Heading list
  - Link extraction (wiki + markdown + external)
  - Stats accuracy
  - Task extraction passthrough
  - Edge cases: empty file, frontmatter-only, no headings, canvas files excluded
