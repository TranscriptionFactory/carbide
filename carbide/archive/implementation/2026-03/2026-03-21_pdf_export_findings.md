# PDF Export Findings

**Date:** 2026-03-21
**Scope:** Current PDF export surface and implementation in the Badgerly codebase as it relates to Carbide product work

## Bottom line

There is one implemented PDF export path today.

It is available from three entry points, but they all execute the same action:

1. File menu: `Export as PDF`
2. Command palette: `Export as PDF`
3. Hotkey: `CmdOrCtrl+Shift+E`

This is not three export systems. It is one export action exposed in three places.

## Architecture path

The implementation follows the architecture correctly.

UI entry points dispatch through the action registry, and the export logic lives in the document feature.

Flow:

1. menu, command palette, or hotkey triggers `ACTION_IDS.document_export_pdf`
2. `register_document_actions()` handles that action
3. the action reads the currently open note from the editor store
4. it calls `export_note_as_pdf(title, open_note.markdown)`
5. `pdf_export.ts` builds a PDF with `jsPDF` and saves `${title}.pdf`

That is aligned with `docs/architecture.md` and avoids bypassing the action registry.

## What it exports

The current exporter only handles the currently open note.

More specifically:

- source input is the note's markdown string
- title is taken from `open_note.meta.title || open_note.meta.name`
- output is a downloaded or saved PDF named after that title

This is note export, not general document export and not workspace export.

## What formatting is actually supported

The current exporter is a simple markdown-to-text mapper with a few heading styles.

Implemented behavior:

- A4 page format
- fixed margins
- Helvetica font
- H1, H2, H3 detection with larger bold text
- paragraph text wrapping via `splitTextToSize`
- pagination when content exceeds page height
- stripping of inline markdown markers for:
  - bold
  - italic
  - inline code
  - strikethrough

## What is not really supported

This is where the important nuance is.

The current exporter does not appear to be a rendered-note export. It is a lightweight markdown parser that writes plain text into a PDF.

Not meaningfully supported today:

- WYSIWYG export from the visual editor
- rendered markdown styling beyond basic H1 to H3 headings
- images
- embedded PDFs
- tables
- code blocks with syntax styling
- callouts
- task lists with real checkbox rendering
- blockquotes with distinct styling
- links with clickable PDF output semantics
- frontmatter-aware formatting
- page size or margin options
- theme-aware export
- headers, footers, page numbers, or export metadata controls
- batch export
- canvas export
- export of non-note document tabs

Some markdown will still appear in the PDF as plain text, but without proper formatting semantics. That is not the same thing as real markdown export support.

## Product surface vs implementation reality

The product surface is stronger than the implementation.

The label `Export as PDF` sounds like a general, polished export feature. The code is closer to:

- export current markdown note
- flatten most formatting
- save a readable PDF

That can be acceptable as a first pass. It is not acceptable if the product goal is faithful document export.

## Evidence in the repo

### Entry points

- `src-tauri/src/app/menu.rs`
  - File menu item with id `document_export_pdf`
- `src/lib/features/search/domain/search_commands.ts`
  - command palette item `Export as PDF`
- `src/lib/features/hotkey/domain/default_hotkeys.ts`
  - `CmdOrCtrl+Shift+E`

### Action wiring

- `src/lib/app/action_registry/action_ids.ts`
  - `document_export_pdf: "document.export_pdf"`
- `src/lib/features/document/application/document_actions.ts`
  - registers the `Export as PDF` action

### Export implementation

- `src/lib/features/document/domain/pdf_export.ts`
  - `export_note_as_pdf()`
  - `parse_blocks()`
  - heading sizing and pagination logic

### Tests

- `tests/unit/domain/pdf_export.test.ts`
  - verifies filename
  - heading rendering
  - inline markdown stripping
  - pagination

### Product planning signal

- `carbide/TODO.md`
  - marks `PDF export of notes (jsPDF + Cmd+Shift+E)` as done

That wording is more honest than the current general UI label because it correctly says `notes`.

## Strategic interpretation

If the goal is lightweight plain-note export, the current implementation is fine as a placeholder.

If the goal is high fidelity export that matches what the user sees in the editor, extending this parser further is probably the wrong path. That road turns into a second renderer.

The real options are:

1. keep extending `jsPDF`
   - fastest incremental path
   - lowest fidelity
   - highest risk of accumulating formatting edge cases
2. render note HTML and print or convert that to PDF
   - better fidelity
   - better alignment with visual editor expectations
3. use a dedicated backend document pipeline such as Pandoc or Typst
   - best for serious publishing workflows
   - highest complexity and packaging cost

## Recommendation

Do not pretend the current implementation is more than it is.

For now, describe it internally as:

`current note PDF export with basic text formatting`

If Carbide needs faithful export, move toward an HTML or render-based PDF pipeline instead of teaching `pdf_export.ts` to become a full markdown renderer.
