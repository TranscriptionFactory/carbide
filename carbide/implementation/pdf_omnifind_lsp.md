# PDF & Non-Markdown Document Search Integration

> Status: `[ ]` pending | `[~]` in progress | `[x]` done | `[-]` deferred

## Overview

Make PDFs and other non-markdown text documents (code files, CSVs, text files) searchable via omnifind/FTS and optionally available to LSPs for linting/completion.

## Current State

### What's Already Working

1. **Document Viewer** (`src/lib/features/document/`) — PDFs, images, code/text files render correctly in a dedicated viewer
2. **File Type Detection** (`document_types.ts`) — `detect_file_type()` correctly identifies PDFs, images, CSVs, code, text
3. **FTS Indexing** (`src-tauri/src/features/search/db.rs`) — SQLite FTS5 with BM25 ranking already powers omnifind
4. **Canvas Indexing** — `.canvas` and `.excalidraw` files are indexed by extracting text content from JSON
5. **LSP Infrastructure** (`src-tauri/src/features/lint/lsp.rs`) — LSP client with document sync for open files

### What's Missing

1. **PDF content extraction** — PDFs aren't indexed for search; text inside PDFs is invisible to omnifind
2. **Code/text file indexing** — `.py`, `.rs`, `.txt`, etc. aren't indexed (markdown-only currently)
3. **Omnifind routing bug** — PDFs opened from omnifind show binary content instead of opening in document viewer
4. **LSP for non-markdown files** — Only markdown files get LSP features (linting, completion)

---

## Phase 1: FTS Indexing for Non-Markdown Files

### 1.1 Architecture Decision: Unified Index vs Separate

**Decision: Unified `notes_fts` table with type discrimination**

Current schema tracks `path` as primary key. We extend:

```sql
-- Add file_type column to notes table
ALTER TABLE notes ADD COLUMN file_type TEXT DEFAULT 'markdown';

-- FTS remains path-keyed; includes body content
-- Search results include file_type for routing
```

**Rationale:**

- Single FTS index = simpler query logic
- Type column allows filtering in WHERE clause if needed
- Minimal schema change
- Works with existing omnifind infrastructure

### 1.2 Backend: Text Extraction Module

Create `src-tauri/src/features/search/text_extractor.rs`:

```rust
pub enum ExtractedContent {
    Markdown { body: String },
    Canvas { body: String },
    Pdf { body: String, page_count: u32 },
    Code { body: String, language: String },
    Text { body: String },
    Binary, // Not indexable
}

pub fn extract_indexable_content(
    path: &Path,
    raw_bytes: &[u8],
) -> Result<ExtractedContent, String> {
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    match ext {
        "md" => extract_markdown(raw_bytes),
        "canvas" | "excalidraw" => extract_canvas(raw_bytes), // existing
        "pdf" => extract_pdf(raw_bytes),
        "py" | "rs" | "ts" | "js" | "json" | "yaml" | "yml" | "toml" | "sh" | "bash"
          => extract_code(raw_bytes, ext),
        "txt" | "log" | "ini" => extract_text(raw_bytes),
        _ => Ok(ExtractedContent::Binary),
    }
}
```

### 1.3 PDF Text Extraction

**Option A: `pdf-extract` crate** (Recommended)

- Pure Rust, no external dependencies
- Extracts text content with page boundaries
- Handles most PDF types including scanned (with OCR flag)

**Option B: `pdftotext` CLI wrapper**

- More robust for complex PDFs
- Requires system dependency
- Better OCR support

**Recommendation:** Start with `pdf-extract`, add `pdftotext` fallback for edge cases.

```rust
fn extract_pdf(raw_bytes: &[u8]) -> Result<ExtractedContent, String> {
    use pdf_extract::extract_text_from_mem;
    let body = extract_text_from_mem(raw_bytes)
        .map_err(|e| format!("PDF extraction failed: {}", e))?;
    // Store page count for snippet context
    let page_count = count_pdf_pages(raw_bytes)?;
    Ok(ExtractedContent::Pdf { body, page_count })
}
```

### 1.4 Code/Text File Extraction

```rust
fn extract_code(raw_bytes: &[u8], ext: &str) -> Result<ExtractedContent, String> {
    let body = String::from_utf8_lossy(raw_bytes).into_owned();
    let language = ext_to_language(ext); // py -> Python, rs -> Rust, etc.
    Ok(ExtractedContent::Code { body, language })
}

fn extract_text(raw_bytes: &[u8]) -> Result<ExtractedContent, String> {
    let body = String::from_utf8_lossy(raw_bytes).into_owned();
    Ok(ExtractedContent::Text { body })
}
```

### 1.5 Indexing Pipeline Integration

Modify `src-tauri/src/features/search/db.rs`:

```rust
fn upsert_note_to_db(
    conn: &Connection,
    meta: &IndexNoteMeta,
    content: &ExtractedContent,
) -> Result<(), String> {
    // Existing markdown path
    let (title, body, file_type) = match content {
        ExtractedContent::Markdown { body } => {
            (meta.title.clone(), body.clone(), "markdown")
        }
        ExtractedContent::Pdf { body, .. } => {
            (meta.title.clone(), body.clone(), "pdf")
        }
        ExtractedContent::Code { body, language } => {
            (meta.title.clone(), body.clone(), language)
        }
        ExtractedContent::Text { body } => {
            (meta.title.clone(), body.clone(), "text")
        }
        _ => return Ok(()), // Skip non-indexable
    };

    // Upsert into notes table
    conn.execute(UPSERT_NOTE_SQL, params![meta.path, title, meta.mtime_ms, meta.size_bytes, file_type])?;
    // Upsert into FTS
    conn.execute(INSERT_NOTE_FTS_SQL, params![title, meta.name, meta.path, body])?;
    Ok(())
}
```

### 1.6 Indexing Sync Points

Update file scanning in `scan_vault()`:

```rust
// Currently: only .md files
// Change: all non-excluded files, extract by type
for entry in WalkDir::new(root).filter_entry(...) {
    if entry.file_type().is_file() {
        files.push(entry.path().to_path_buf());
    }
}
```

Update `sync_index()` and `rebuild_index()` to:

1. Read file bytes (not just UTF-8 content)
2. Call `extract_indexable_content()`
3. Skip `ExtractedContent::Binary`
4. Index everything else

### 1.7 Frontend: Search Result Routing

**Bug Fix:** `omnibar_actions.ts` already has routing but bypassed for notes.

Current flow (buggy):

```typescript
// omnibar_actions.ts:234
case "note":
    if (detect_file_type(item.note.id)) {
        // Routes to document_open (correct!)
    } else {
        // Routes to note_open (correct for .md)
    }
```

The routing exists but may not be applied consistently. Verify `handle_resolved_internal_target()` is called.

### 1.8 Search Result Metadata

Add `file_type` to search results:

```typescript
// src/lib/shared/types/search.ts
export interface NoteSearchHit {
  // Existing fields...
  file_type?: DocumentFileType; // 'pdf' | 'code' | 'text' | null (markdown)
}
```

Update Rust model:

```rust
pub struct SearchHit {
    // Existing fields...
    pub file_type: Option<String>,
}
```

### 1.9 Snippet Context for PDFs

When displaying PDF search results, show page number context:

```typescript
// Omnibar display
"report.pdf" (page 3)
"...matched text on page 3..."
```

Requires storing page offsets during extraction:

```rust
// In PDF extraction, store page-start byte positions
struct PdfIndexContent {
    body: String,
    page_offsets: Vec<usize>, // Character offset where each page starts
    page_count: u32,
}
```

---

## Phase 2: LSP Integration for Text-Based Documents

### 2.1 Scope: Which Files Get LSP?

| File Type           | LSP Support                | Priority        |
| ------------------- | -------------------------- | --------------- |
| `.md`               | markdownlint               | High (existing) |
| `.py`               | pyright/pylsp              | Medium          |
| `.rs`               | rust-analyzer              | Medium          |
| `.ts/.js`           | typescript-language-server | Medium          |
| `.json/.yaml/.toml` | schemas                    | Low             |
| `.pdf`              | None (binary)              | N/A             |
| `.txt/.log/.ini`    | None (no standard)         | N/A             |

### 2.2 LSP Manager Refactor

Current: One LSP client (markdownlint) per vault.

Refactor to support multiple LSPs:

```rust
// src-tauri/src/features/lint/lsp_manager.rs
pub struct LspManager {
    vault_id: String,
    clients: HashMap<String, Box<dyn LspClient>>, // key: language id
}

impl LspManager {
    pub async fn start_lsp(&mut self, language: &str, config: LspConfig) -> Result<(), String>;
    pub async fn on_file_open(&self, path: &str, content: &str);
    pub async fn on_file_change(&self, path: &str, content: &str);
    pub async fn on_file_close(&self, path: &str);
}
```

### 2.3 LSP Discovery / Configuration

**Option A: Built-in LSP mappings**

```rust
const LSP_CONFIGS: &[(&str, &str, &[&str])] = &[
    ("python", "pyright", &["--stdio"]),
    ("rust", "rust-analyzer", &[]),
    ("typescript", "typescript-language-server", &["--stdio"]),
];
```

**Option B: User-configurable settings**

```json
// vault/.carbide/settings.json
{
  "lsp": {
    "python": { "command": "pyright", "args": ["--stdio"] },
    "rust": { "command": "rust-analyzer" }
  }
}
```

**Recommendation:** Start with Option A, add Option B as settings UI matures.

### 2.4 Document Sync for Non-Markdown

Extend `lsp_document_sync_reactor.svelte.ts`:

```typescript
export function create_lsp_document_sync_reactor(
  editor_store: EditorStore,
  clients: LspSyncClientConfig[], // Now supports multiple LSPs
): () => void {
  // Existing: watches open_note.markdown
  // New: detect file type, route to appropriate LSP client
}
```

Add language detection:

```typescript
function get_lsp_language(file_type: DocumentFileType | null): string | null {
  switch (file_type) {
    case "code":
      return detect_language_from_extension(get_extension(path));
    case "markdown":
      return "markdown";
    default:
      return null;
  }
}
```

### 2.5 LSP Diagnostics Display

Current: Diagnostics show in editor margins.

For non-markdown files opened in document viewer:

- Show diagnostics in a "Problems" panel (similar to VS Code)
- Click diagnostic → scroll to line in code viewer

### 2.6 Out-of-Scope (Phase 2.5+)

- **Completions:** Requires LSP capability negotiation, completion request handling
- **Go-to-definition:** Requires workspace-wide symbol indexing
- **Quick fixes:** Requires code action support

---

## Phase 3: Implementation Tasks

### Backend (Rust)

- [x] Create `text_extractor.rs` module in `src-tauri/src/features/search/`
- [x] Add `pdf-extract` dependency to `Cargo.toml`
- [x] Implement `extract_indexable_content()` for all file types
- [x] Modify `notes` table: add `file_type` column
- [x] Update `db.rs`: `scan_vault()` to include all files
- [x] Update `db.rs`: `upsert_note()` to use text extraction (`upsert_plain_content` + `index_single_file_from_disk`)
- [x] Update `db.rs`: `sync_index()` to handle binary skip (all 3 sync paths: rebuild, sync, sync_paths)
- [x] Modify `IndexNoteMeta` to include `file_type`
- [x] Update `SearchHit` model with `file_type` field — wired `file_type` through all SQL paths: `search()`, `suggest()`, `fuzzy_suggest()`, `get_note_meta()`, `get_all_notes`, `get_outlinks()`, `get_backlinks()`, `note_meta_with_stats_from_row()`
- [x] Implement PDF page offset tracking for snippet context — `extract_text_from_mem_by_pages` for per-page extraction, `page_offsets` JSON column in notes table, `resolve_snippet_page()` maps snippet to page number, `snippet_page` field in `SearchHit` and `HybridSearchHit`
- [x] Write additional tests for PDF extraction (15 unit tests in text_extractor, 16 integration tests in search_db_behavior)
- [-] Write benchmarks for PDF extraction performance — deferred; not blocking

### Frontend (TypeScript)

- [x] Update `NoteSearchHit` type with `file_type` (via `NoteMeta.file_type`)
- [x] Update `search_tauri_adapter.ts` to map `file_type`
- [x] Fix omnifind result routing (fixed `cross_vault_note` to use `detect_file_type`)
- [x] Add snippet metadata (page number for PDFs) — `snippet_page` wired through `NoteSearchHit`, `HybridSearchHit`, `OmnibarItem`, adapter, service, omnibar UI shows "p.N" prefix
- [x] Update omnibar display to show file type icon/badge — distinct icons for PDF (`FileDownIcon`), code (`FileCodeIcon`), markdown (`FileIcon`); file type badge ("PDF", "Code", "Text") for non-markdown results in both `note` and `cross_vault_note` items
- [x] Create `CodeLspManager` in Rust (`src-tauri/src/features/code_lsp/manager.rs`) — per-vault, on-demand multi-language LSP management
- [x] Create `code_lsp_document_sync` reactor — watches DocumentStore for code file opens/closes, routes to LSP
- [x] Diagnostics from code LSPs flow through DiagnosticsStore ("code_lsp" source) → existing problems panel

### Infrastructure

- [x] Migration: Add `file_type` and `page_offsets` columns to existing databases (additive ALTER TABLE in `init_schema`)
- [-] Document extraction behavior for each file type — deferred
- [-] Update user docs with search capabilities — deferred

---

## Technical Considerations

### Performance

1. **PDF Extraction Cost:** PDF parsing is CPU-intensive. Use background thread pool (existing `writer_thread_loop` pattern)
2. **Index Rebuild Time:** Will increase with PDFs. Consider progress granularity improvements
3. **Memory:** Large PDFs may need streaming extraction; `pdf-extract` loads entire file

### Edge Cases

1. **Scanned PDFs (no OCR):** Return empty body, mark as non-indexable
2. **Encrypted PDFs:** Return `ExtractedContent::Binary`, skip indexing
3. **Binary files masquerading as text:** UTF-8 validation fails → skip
4. **Very large code files:** Consider truncating body for FTS (first N KB)

### Backward Compatibility

- Existing `notes` rows without `file_type` default to `'markdown'`
- Migration is additive, no data loss
- Old clients can still query (file_type is optional in response)

---

## Testing Strategy

### Unit Tests

- Text extraction for each file type (markdown, pdf, code, text)
- Binary detection and skip logic
- Language detection from extensions

### Integration Tests

- Full index → search flow for PDFs
- Omnifind result routing for all file types
- Index incremental sync (add/remove PDF)
- Large PDF handling (>10MB)

### Performance Benchmarks

- PDF extraction throughput (pages/second)
- Index time with mixed file types
- Search latency with non-markdown hits

---

## Dependencies

| Package       | Purpose             | Add to                    |
| ------------- | ------------------- | ------------------------- |
| `pdf-extract` | PDF text extraction | `Cargo.toml`              |
| `lsp-types`   | LSP protocol types  | `Cargo.toml` (if Phase 2) |

Frontend: No new dependencies (existing document viewer handles display)

---

## Estimated Effort

| Phase            | Backend  | Frontend | Total    |
| ---------------- | -------- | -------- | -------- |
| Phase 1 (FTS)    | 2-3 days | 1 day    | 3-4 days |
| Phase 2 (LSP)    | 3-4 days | 2 days   | 5-6 days |
| Testing + Polish | 1 day    | 1 day    | 2 days   |

**Total: 10-12 days for full implementation**

Phase 1 alone delivers significant value (PDF search). Phase 2 can be deferred.

---

## Risks & Mitigations

| Risk                               | Mitigation                                               |
| ---------------------------------- | -------------------------------------------------------- |
| PDF extraction fails on edge cases | Fallback to `pdftotext` CLI; mark as non-indexable       |
| Index time regression              | Parallel extraction; incremental indexing already exists |
| Binary false positives             | Strict UTF-8 validation; extension allowlist             |
| LSP not installed                  | Graceful degradation; show "LSP not available" message   |
| Large files OOM                    | Truncate body for indexing; enforce size limits          |

---

## Success Criteria

1. ✅ PDF files appear in omnifind search results
2. ✅ Code/text files appear in omnifind search results
3. ✅ Clicking a PDF result opens document viewer (not binary text)
4. ✅ Search snippet shows context including page number for PDFs
5. ✅ Index time within acceptable bound (<2x current for typical vault)
6. ✅ LSP diagnostics for Python/Rust/TS files (if Phase 2 completed)
