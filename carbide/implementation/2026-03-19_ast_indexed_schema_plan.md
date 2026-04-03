---
title: "Plan: AST-Indexed SQLite Schema + Enhanced Metadata (6B)"
date_created: 2026-03-19
status: complete
---

## Context

Currently the indexer walks the comrak AST and extracts into 6 relational tables: `note_headings`, `note_links`, `note_tags` (frontmatter only), `note_properties`, `tasks`, `outlinks`. The AST itself is discarded after extraction — structured content like inline tags, section boundaries, and code block metadata are lost.

### Design Decision: Hybrid Relational-First

Start with new relational tables (fast indexed queries, incremental, composable). Add AST fragment caching later only when transclusion (`![[Note#section]]`) requires it.

---

## Phase 1: New Relational Tables

### 1a. `note_inline_tags` — unified tag table (replaces `note_tags`)

```sql
CREATE TABLE note_inline_tags (
    path       TEXT NOT NULL,
    tag        TEXT NOT NULL,
    line       INTEGER NOT NULL,
    source     TEXT NOT NULL,  -- 'frontmatter' | 'inline'
    PRIMARY KEY (path, tag, line),
    FOREIGN KEY (path) REFERENCES notes(path) ON DELETE CASCADE
);
CREATE INDEX idx_inline_tags_tag ON note_inline_tags(tag);
CREATE INDEX idx_inline_tags_source ON note_inline_tags(source);
```

**Tag syntax supported:**

| Syntax                        | Source        | Example                                   |
| ----------------------------- | ------------- | ----------------------------------------- |
| `tags: [a, b]` in frontmatter | `frontmatter` | existing                                  |
| `#tag` in body text           | `inline`      | Obsidian-compatible                       |
| `#tag/subtag` hierarchical    | `inline`      | e.g. `#status/active`, `#project/carbide` |

**Decision:** No `#$keyword` syntax. Hierarchical tags via `/` provide the same semantics without inventing new syntax. Query with `WHERE tag LIKE 'status/%'` for subtree matching.

**Migration:** Drop `note_tags` + recreate as `note_inline_tags` on next index rebuild.

### 1b. `note_sections` — section-level AST index

```sql
CREATE TABLE note_sections (
    path       TEXT NOT NULL,
    heading_id TEXT NOT NULL,      -- slugified heading text (anchor)
    level      INTEGER NOT NULL,   -- 1-6
    title      TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line   INTEGER NOT NULL,   -- line before next same-or-higher-level heading, or EOF
    word_count INTEGER NOT NULL,
    PRIMARY KEY (path, heading_id),
    FOREIGN KEY (path) REFERENCES notes(path) ON DELETE CASCADE
);
CREATE INDEX idx_note_sections_path ON note_sections(path);
```

Enables: section-scoped link queries, section-level word counts, future `[[Note#heading]]` anchor resolution, and transclusion.

### 1c. `note_code_blocks` — fenced code block metadata

```sql
CREATE TABLE note_code_blocks (
    path     TEXT NOT NULL,
    line     INTEGER NOT NULL,
    language TEXT,               -- 'rust', 'mermaid', 'dataview', etc.
    length   INTEGER NOT NULL,   -- line count
    PRIMARY KEY (path, line),
    FOREIGN KEY (path) REFERENCES notes(path) ON DELETE CASCADE
);
CREATE INDEX idx_note_code_blocks_lang ON note_code_blocks(language);
```

Enables: "all notes with mermaid diagrams", "notes with Python code".

### 1d. Extend `note_links` with section context

```sql
ALTER TABLE note_links ADD COLUMN section_heading TEXT;
ALTER TABLE note_links ADD COLUMN target_anchor TEXT;   -- #heading fragment if present
```

---

## Phase 2: Comrak AST Walk Extension (Rust)

**File:** `src-tauri/src/shared/markdown_doc.rs`

Extend `parse_note()` AST walk to collect:

1. **Inline tags:** Scan `NodeValue::Text` nodes for `#[\w][\w/-]*` regex (excluding inside headings, code blocks, links). Collect `(tag_text, line_number)`.
2. **Sections:** After collecting headings, compute section ranges (each heading's range = its line to line before next same-or-higher-level heading, or EOF).
3. **Code blocks:** `NodeValue::CodeBlock` — capture `(line, language, line_count)`.
4. **Link section context:** For each link, find which section heading it falls under by line number.

**Updated `ParsedNote` struct:**

```rust
pub struct InlineTag {
    pub tag: String,
    pub line: usize,
}

pub struct Section {
    pub heading_id: String,  // slugified
    pub level: u8,
    pub title: String,
    pub start_line: usize,
    pub end_line: usize,
    pub word_count: i64,
}

pub struct CodeBlockMeta {
    pub line: usize,
    pub language: Option<String>,
    pub length: usize,
}

pub struct ParsedNote {
    // ... existing fields ...
    pub inline_tags: Vec<InlineTag>,
    pub sections: Vec<Section>,
    pub code_blocks: Vec<CodeBlockMeta>,
}
```

---

## Phase 3: Enhanced Frontmatter Properties

### Nested property flattening

For YAML like:

```yaml
project:
  name: Carbide
  status: active
```

Store as dot-path: `project.name = "Carbide"`, `project.status = "active"`.

For arrays:

```yaml
aliases: [carbide, the-app]
```

Store each element as separate row with same key: `aliases = "carbide"`, `aliases = "the-app"`.

### Property registry table

```sql
CREATE TABLE property_registry (
    key           TEXT PRIMARY KEY,
    inferred_type TEXT NOT NULL,  -- most common type across vault
    note_count    INTEGER NOT NULL
);
```

Rebuilt during index sync by aggregating `note_properties`. Powers future structured property editor.

---

## Phase 4: Query API (Tauri Commands)

| Command                     | Purpose                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| `tags_list_all_unified`     | All tags (inline + frontmatter) with source breakdown and counts     |
| `tags_get_notes_for_tag`    | Updated to query `note_inline_tags` with optional source filter      |
| `notes_with_tag_in_section` | Notes where `#tag` appears in a specific section                     |
| `notes_with_code_language`  | Notes containing code blocks in a given language                     |
| `property_registry_list`    | All known property keys with inferred types and usage counts         |
| `notes_by_property_filter`  | Filter notes by property conditions (extends existing `bases_query`) |
| `section_get_range`         | Get line range for a section (for future transclusion)               |

---

## Phase 5: DB Cleanup Integration

All new tables cleaned up in:

- `remove_note()` — DELETE from `note_inline_tags`, `note_sections`, `note_code_blocks`
- `remove_notes_by_prefix()` — same
- `rebuild_index()` — DELETE all rows from new tables
- `rename_note_path()` / `rename_folder_paths()` — UPDATE path in new tables

---

## Implementation Order

| Step    | Scope                                                                                         | Files                           | Status      |
| ------- | --------------------------------------------------------------------------------------------- | ------------------------------- | ----------- |
| **S1**  | Inline `#tag` extraction in comrak walk + `InlineTag` struct                                  | `markdown_doc.rs`               | Done (6B)   |
| **S2**  | Section range computation + `Section` struct                                                  | `markdown_doc.rs`               | Done (6B)   |
| **S3**  | Code block metadata + `CodeBlockMeta` struct                                                  | `markdown_doc.rs`               | Done (6B)   |
| **S4**  | New tables in `init_schema` + migration detection                                             | `db.rs`                         | Done (6B)   |
| **S5**  | `upsert_note_parsed_inner` writes to new tables, replaces `note_tags` with `note_inline_tags` | `db.rs`                         | Done (6B)   |
| **S6**  | Nested property flattening in `upsert_note_parsed_inner`                                      | `db.rs`, `frontmatter.rs`       | Done (6B)   |
| **S7**  | `property_registry` rebuild (post-index aggregation)                                          | `db.rs`, `service.rs`           | Done (6B-c) |
| **S8**  | Cleanup: `remove_note`, `remove_notes_by_prefix`, `rebuild_index`, renames                    | `db.rs`                         | Done (6B)   |
| **S9**  | New Tauri query commands                                                                      | `tags/service.rs`, `app/mod.rs` | Done (6B-c) |
| **S10** | Tests for all new extraction + DB operations                                                  | `markdown_doc.rs`, `db.rs`      | Done (6B-c) |

**Legend:** (6B) = initial commit `43fd6f04`, (6B-c) = completion commit (this branch).

### Completion Notes (2026-03-20)

**S7 gap fixed:** `rebuild_property_registry()` is now called in `run_index_op()` after successful rebuild/sync with `indexed > 0`. Previously the function existed but was never invoked in the production flow.

**S9 commands added:**

- `notes_with_tag_in_section(vault_id, tag, heading_id)` — JOINs `note_inline_tags` with `note_sections` to find notes where a tag appears within a specific section's line range.
- `notes_by_property_filter(vault_id, filters: Vec<PropertyFilter>)` — Filters notes by property conditions. Supports operators: `=`/`eq`, `!=`/`neq`, `like`, `exists`, `not_exists`. All filters are AND-combined.

**S10 tests added:**

- `upsert_writes_inline_tags` — verifies frontmatter + inline tags written with correct source/line
- `upsert_writes_sections` — verifies section ranges populated correctly
- `upsert_writes_code_blocks` — verifies code block language + length storage
- `nested_property_flattening` — verifies dot-path flattening for nested YAML
- `remove_note_cleans_all_new_tables` — verifies cleanup covers all new tables

---

## Open Items (Deferred)

- **Structured property editor UI** — Frontend component for editing typed properties. Depends on `property_registry`. Separate PR.
- **Section-level transclusion** — `![[Note#heading]]` resolution using `note_sections`. Schema ready, rendering deferred.
- **Tag panel UI** — Frontend panel showing inline/frontmatter tags with source toggle. Depends on `tags_list_all_unified`.
