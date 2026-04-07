# Generic Source Editing for Non-Markdown Files — Implementation Plan

**Date:** 2026-03-31 (updated 2026-04-07)
**Status:** Planning
**Context:** Extend the document viewer to support editable source mode for all text-based files, reusing CodeMirror 6 infrastructure already present in `code_viewer.svelte`.

---

## Motivation

Currently all non-markdown files open as read-only viewers. Text-based files (`.py`, `.ts`, `.json`, `.txt`, `.html`, etc.) should be editable directly in Carbide without switching to an external editor. The note system already solves this for markdown; we need a thin extension to the document system.

---

## Scope

**In scope:** Editable source mode for *any* non-binary file. Syntax highlighting via CodeMirror's `@codemirror/language-data` where available; plain text fallback otherwise.

**Out of scope:** CSV/TSV table view (deferred — opens as plain text for now), visual/rendered mode for code, diff view, multi-cursor, LSP integration, PDF/image editing.

---

## Architecture Decision

### "Text by default" policy

Instead of maintaining an allowlist of editable extensions, flip the logic: only **binary/special** file types get dedicated viewers. Everything else opens as editable text.

The binary/special set is small and stable:

| `DocumentFileType` | Viewer          |
| ------------------ | --------------- |
| `"pdf"`            | PDF viewer      |
| `"image"`          | Image viewer    |
| `"canvas"`         | Canvas editor   |
| `"excalidraw"`     | Excalidraw      |

Any file not in this set — whether it's `.py`, `.rs`, `.csv`, `.sql`, `.go`, `.ini`, `.log`, or an unknown extension — opens as editable text. Syntax highlighting is resolved from the filename via `LanguageDescription.matchFilename()`; if nothing matches, the file gets plain text editing.

This eliminates the need to grow `DOCUMENT_TYPE_MAP` every time a new language is encountered. The map shrinks to only binary/special types. A dedicated CSV table viewer can be added later as a separate feature.

**Binary safety:** Files with known binary extensions (`.docx`, `.xlsx`, `.zip`, `.gz`, `.tar`, `.dmg`, `.exe`, `.dll`, `.so`, `.dylib`, `.wasm`, etc.) must be denied at the type detection level — a binary extension denylist. For unknown extensions, check for null bytes in the first 8KB of content before opening in edit mode; fall back to a "binary file — cannot edit" notice. Null-byte check alone is insufficient because zip-based formats (`.docx`, `.xlsx`) start with `PK`, not null bytes.

### New `document_editor.svelte` — NOT reusing `SourceEditor`

**Why not reuse `source_editor_content.svelte`:** It has three hard couplings to the note system beyond outline extraction:

1. **Content sync reads `stores.editor.open_note`** — will pull in wrong content or null for document tabs
2. **`set_source_content_getter`** — overwrites a global getter used for note saves; mounting a document tab would break note saving
3. **Hardcodes `@codemirror/lang-markdown`** — a `.py` file would get markdown syntax highlighting

Instead, build `document_editor.svelte` based on `code_viewer.svelte`, which already has:
- Filename-based language detection via `LanguageDescription.matchFilename()`
- Clean CodeMirror 6 setup with no note-store coupling
- Proper extension loading

The adaptation is minimal: remove `readOnly`/`editable.of(false)`, add an `updateListener` that calls an `on_change` prop. This is less "reuse" but avoids a risky decoupling of a component tightly integrated with the note system.

### Reuse the Note pattern for state

Follow the same **Note pattern** for dirty state and save semantics — don't invent a new abstraction. The document system already has the right shape; it just needs a write port and dirty state.

---

## Invariants / BDD Scenarios

These define correctness — all must pass before shipping:

1. Opening any non-binary file shows content in an editable CodeMirror editor (not the read-only `CodeViewer`)
2. A `.py` file gets Python syntax highlighting; a `.unknown` file gets plain text — both are editable
3. A `.md` file still opens as a note (not a document) — `detect_file_type` returns `null` for `.md`
4. A `.docx` / `.zip` file does not open as editable text (binary denylist)
5. Typing in the editor marks the tab as dirty (`is_dirty = true`)
6. `Cmd+S` saves the file to disk; tab becomes clean
7. Closing a dirty tab prompts "unsaved changes" and Save actually works (not just the prompt)
8. Saving writes exactly the editor content — no silent transformation
9. Opening a PDF, image, canvas, or excalidraw file is unaffected
10. Reopening a saved file shows the updated content
11. Undo/redo work within a session (CodeMirror native)
12. Files above size threshold (>1MB) open read-only with a notice
13. Evicting an inactive document tab does not discard unsaved edits

---

## Implementation Steps

### Step 1: Simplify `detect_file_type` — text-by-default

**File:** `src/lib/features/document/domain/document_types.ts`

- Shrink `DOCUMENT_TYPE_MAP` to only binary/special types (`pdf`, `image`, `canvas`, `excalidraw`) plus a **binary extension denylist** (`".docx"`, `".xlsx"`, `".pptx"`, `".zip"`, `".gz"`, `".tar"`, `".7z"`, `".rar"`, `".dmg"`, `".app"`, `".exe"`, `".dll"`, `".so"`, `".dylib"`, `".wasm"`, `".class"`, `".o"`, `".obj"`)
- Binary denylist entries map to `null` (not openable as document) — these fall through to shell open, same as today
- All other extensions return `"text"`
- Files with no extension return `null` (unchanged)
- Collapse `"code"`, `"text"`, `"html"`, `"csv"` into a single `"text"` type

**File:** `src/lib/features/document/types/document.ts`

```typescript
export type DocumentFileType =
  | "pdf"
  | "image"
  | "text"       // all editable text files — syntax highlighting resolved from filename
  | "canvas"
  | "excalidraw";
```

Add helpers:

```typescript
export function is_binary_type(file_type: DocumentFileType): boolean {
  return file_type === "pdf" || file_type === "image";
}

export function is_editable_type(file_type: DocumentFileType): boolean {
  return file_type === "text";
}
```

**Update existing tests immediately:**
- `tests/unit/domain/document_types.test.ts` — update `"csv"`, `"code"`, `"html"` assertions to `"text"`
- `tests/unit/domain/detect_file_type.test.ts` — update all affected assertions; add binary denylist and `.md` → `null` test cases

---

### Step 2: Build `document_editor.svelte`

**New file:** `src/lib/features/document/ui/document_editor.svelte`

Based on `code_viewer.svelte`'s CodeMirror setup pattern (lines 192–267), which already does:
- `LanguageDescription.matchFilename(languages, filename)` for syntax highlighting
- Clean CodeMirror 6 initialization with no note-store coupling

Adaptations:
- Remove `EditorState.readOnly.of(true)` and `EditorView.editable.of(false)`
- Add `EditorView.updateListener.of()` that calls an `on_change(content: string)` prop
- Props: `content: string`, `filename: string`, `on_change: (content: string) => void`
- No `stores.editor` coupling, no outline extraction, no markdown language hardcoding

**Do NOT modify `source_editor_content.svelte`** — it stays as-is for the note editor.

---

### Step 3: Wire `write_file` to existing Rust command

**Discovery:** `write_vault_file` already exists at `src-tauri/src/features/notes/service.rs:1609` and is registered at `src-tauri/src/app/mod.rs:214`. It uses `io_utils::atomic_write` (write to temp, rename) with `safe_vault_abs` path safety. **No Rust work needed.**

**File:** `src/lib/features/document/ports.ts`

```typescript
write_file(vault_id: VaultId, file_path: string, content: string): Promise<void>
```

**Adapter:** `src/lib/features/document/adapters/document_tauri_adapter.ts`

- Implement via `invoke("write_vault_file", { vault_id, file_path, content })`

**Note:** `read_vault_file` has a 5MB ceiling (`service.rs:1600`). Files between 1MB and 5MB will load but should show read-only (the >1MB edit threshold). Files above 5MB fail at the Rust level — handle with a user-facing error, not a crash.

---

### Step 4: Mutable content state in `DocumentStore`

**File:** `src/lib/features/document/state/document_store.svelte.ts`

Add to `DocumentContentState`:

```typescript
edited_content: string | null; // null = no edits; string = in-memory buffer
is_dirty: boolean;
```

- `edited_content` starts `null`; set on first keystroke
- `is_dirty` drives `Tab.is_dirty` (already plumbed in tab store)
- `current_content` computed getter: `edited_content ?? loaded_content`

**Guard eviction:** `#evict_inactive_content()` (lines 103–117) and `DocumentService.evict_inactive_content` (lines 176–194) must skip content states where `is_dirty === true`. Otherwise, evicting an inactive tab silently discards unsaved edits.

---

### Step 5: Editable mode in `DocumentViewer`

**File:** `src/lib/features/document/ui/document_viewer.svelte` (or `document_viewer_content.svelte`)

For `file_type === "text"` (which now covers all non-binary files):

- Render `DocumentEditor` (new, from Step 2) instead of `CodeViewer`
- Pass `content={content_state.current_content}`, `filename={document.filename}`
- On `on_change` → dispatch `document.edit` action (updates `edited_content`, sets `is_dirty`)
- Language-specific keymaps, indent rules, and bracket matching come along for free via CodeMirror language extensions

**Remove dead imports:** `CsvViewer` and `HtmlViewer` imports from `document_viewer_content.svelte` become unused. Retain the component files for now (CSV table view is deferred, not cancelled) but remove the imports.

**Update `code_viewer.svelte` line 252:** The `file_type === "code"` branch will never match after removing the type. If `CodeViewer` is retained as fallback for read-only large files (>1MB), update to `file_type === "text"` or remove the branch.

---

### Step 6: Save action

**File:** `src/lib/features/document/application/document_actions.ts`

Register `document.save`:

```typescript
{
  id: "document.save",
  keyboard_shortcut: "Mod-s",
  condition: (ctx) => ctx.active_tab?.kind === "document" && is_editable_type(active_doc.file_type),
  handler: async () => {
    const content = store.get_edited_content(tab_id)
    await document_service.save(tab_id, content)
  }
}
```

**`DocumentService.save`:**

1. `write_file(vault_id, file_path, content)`
2. Update `loaded_content` in store to match (so `edited_content` can reset to `null`)
3. Set `is_dirty = false` on content state and tab

---

### Step 7: Fix dirty-tab save path for documents

**File:** `src/lib/features/tab/application/tab_action_helpers.ts`

**Problem:** `save_dirty_tab_if_needed` (lines 195–239) is entirely note-centric — it calls `services.note.save_note()` and `stores.tab.get_cached_note()`. For a dirty document tab, the user sees the "unsaved changes" prompt, clicks Save, and **it silently fails** (returns `"failed"`).

**Fix:** Add a `tab.kind === "document"` branch before the note-specific logic:

```typescript
if (tab.kind === "document" && tab.is_dirty) {
  await services.document.save(tab_id);
  return "saved";
}
```

The prompt trigger itself is fine — it already checks `Tab.is_dirty` generically. Only the save execution path needs the document branch.

---

### Step 8: Tests

**Existing files to update:**
- `tests/unit/domain/document_types.test.ts` — update type assertions
- `tests/unit/domain/detect_file_type.test.ts` — update type assertions, add binary denylist cases

**New file:** `tests/unit/features/document/document_service.test.ts`

Scenarios to cover:

- `detect_file_type` returns `"text"` for unknown text extensions
- `detect_file_type` returns `null` for `.md` (critical — ensures notes still work)
- `detect_file_type` returns `null` for binary denylist extensions (`.docx`, `.zip`, etc.)
- `detect_file_type` returns `"pdf"`, `"image"`, etc. for binary types
- `is_editable_type` / `is_binary_type` helpers are correct
- `open_document` for a `.py` file loads content into store
- Editing sets `is_dirty = true` and populates `edited_content`
- `save` calls `write_file` and resets dirty state
- `current_content` returns `edited_content` over `loaded_content` when both present
- Non-editable types (`"pdf"`, `"image"`) don't expose edit interface
- Dirty content states are not evicted by `evict_inactive_content`
- `save_dirty_tab_if_needed` works for document tabs (not just notes)

---

## File Change Summary

| File                                                           | Change                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/features/document/types/document.ts`                  | Remove `"code"`, `"html"`, `"csv"`; add helpers                     |
| `src/lib/features/document/domain/document_types.ts`           | Shrink map to binary/special; add binary denylist; `"text"` default |
| `src/lib/features/document/ui/document_editor.svelte`          | **New** — editable CodeMirror, based on `code_viewer.svelte`        |
| `src/lib/features/document/ports.ts`                           | Add `write_file`                                                    |
| `src/lib/features/document/adapters/document_tauri_adapter.ts` | Implement `write_file` (wires to existing Rust command)             |
| `src/lib/features/document/state/document_store.svelte.ts`     | Add `edited_content`, `is_dirty`; guard eviction                    |
| `src/lib/features/document/ui/document_viewer.svelte`          | Swap `CodeViewer` → `DocumentEditor` for `"text"` type              |
| `src/lib/features/document/application/document_actions.ts`    | Register `document.save` action                                     |
| `src/lib/features/document/application/document_service.ts`    | Add `save()` method                                                 |
| `src/lib/features/tab/application/tab_action_helpers.ts`       | Add document branch to `save_dirty_tab_if_needed`                   |
| `tests/unit/domain/document_types.test.ts`                     | Update assertions for collapsed types                               |
| `tests/unit/domain/detect_file_type.test.ts`                   | Update assertions; add binary denylist + `.md` cases                |
| `tests/unit/features/document/document_service.test.ts`        | **New** test file                                                   |

**No Rust changes needed** — `write_vault_file` already exists.

**Dead code to clean up:**
- Remove `CsvViewer` / `HtmlViewer` imports from `document_viewer_content.svelte` (retain component files for future CSV table view)
- Check `file_tree_row.svelte` for dead `detect_file_type` import

---

## Risks

- **`SourceEditor` is NOT reused** — building `document_editor.svelte` from `code_viewer.svelte` avoids three note-system couplings (content sync, global getter, hardcoded markdown language). More code, but correct by construction.
- **Large files** — 1MB edit threshold, 5MB Rust read ceiling. Files in 1–5MB range load but show read-only. Files >5MB fail at Rust level — needs a user-facing error.
- **Binary files with known extensions** — denylist covers common formats (`.docx`, `.zip`, `.exe`, etc.). For truly unknown extensions, null-byte check in first 8KB catches most binary files. Zip-based formats start with `PK`, not null bytes, so the denylist is essential.
- **Concurrent external edits** — out of scope for now; treat as a known limitation (same as note system).
- **Removing `"code"`, `"html"`, `"csv"` types** — grep for all usages and update. Small internal API break. No users to migrate. CSV table view can be re-added later as an optional rendered mode for `.csv`/`.tsv` extensions.
- **Content eviction discarding unsaved edits** — `#evict_inactive_content()` must skip dirty states. Without this guard, switching between >3 document tabs silently loses unsaved work.
- **`.md` routing** — `detect_file_type` must continue returning `null` for `.md` to preserve note routing. Explicit test case required.
