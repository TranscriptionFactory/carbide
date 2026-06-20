# Document Viewers

Beyond Markdown notes, Carbide opens many file types directly in a tab. Non-note files are
detected by extension and routed to a dedicated viewer; anything that isn't a recognized
binary falls back to a text/code editor.

## Supported viewers

| Type        | Extensions                                  | Viewer                                                                 |
| ----------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| PDF         | `.pdf`                                      | PDF viewer (pdf.js)                                                    |
| EPUB        | `.epub`                                     | EPUB reader (Foliate.js)                                               |
| Image       | `.png` `.jpg` `.jpeg` `.gif` `.svg` `.webp` | Image viewer (zoom/pan, background style)                              |
| HTML        | `.html` `.htm`                              | Source / Safe / Live modes — see [HTML Artifacts](./html_artifacts.md) |
| Canvas      | `.canvas` `.excalidraw`                     | Excalidraw canvas                                                      |
| Code / text | any other non-binary extension              | CodeMirror editor with syntax highlighting                             |

A **5 MB display cap** applies: files above it show a size warning with a **Load anyway**
override, so a single large file never blocks the UI. Recognized binary formats (`.docx`,
`.xlsx`, `.zip`, executables, …) are not opened as documents.

## EPUB reader

EPUBs render through a vendored build of [Foliate.js](https://github.com/johnfactotum/foliate-js).
The reader is sandboxed: each chapter's HTML gets a strict Content-Security-Policy injected
before display, embedded scripts are disabled, and external links are blocked — an EPUB
cannot execute code or phone home.

Controls:

- **Table of contents** — open the TOC and jump to any chapter (nested entries supported).
- **Page navigation** — previous/next buttons or the arrow keys; a live **progress %** shows
  your position in the book.
- **In-document search** (`Cmd/Ctrl+F`) — find text across the book with next/previous match
  navigation and a match count.

Layout and typography are configured under **Settings → Documents**:

| Setting                      | Key                              | Default    |
| ---------------------------- | -------------------------------- | ---------- |
| Flow                         | `document_epub_flow`             | `scrolled` |
| Max column count (paginated) | `document_epub_max_column_count` | `2`        |
| Max content width            | `document_epub_max_inline_size`  | `720` px   |
| Font scale                   | `document_epub_font_scale`       | `100` %    |
| Line height                  | `document_epub_line_height`      | `1.6`      |

**Flow** switches between **paginated** (column-based pages you advance through) and
**scrolled** (one continuous column). Theme colors follow the active app theme, injected into
the book's stylesheet.

## Reading position

The EPUB reader remembers where you left off. As you read, the current location is captured as
an [EPUB CFI](https://idpf.org/epub/linking/cfi/) and saved (debounced ~1s after you stop
moving). Reopening the book resumes at that location.

Positions are stored **per vault** in `<VAULT>/.carbide/reading_positions.json`, keyed by the
file's vault-relative path. This persistence is EPUB-specific — PDFs restore their last page
within a session but do not write a saved position file. See [Data Storage](./data_storage_locations.md).

## EPUB in vault search

EPUBs are full-text indexed alongside notes, so their contents surface in the omnibar and
hybrid search. On indexing, the spine's XHTML chapters are extracted in reading order and the
book's title is read from its OPF metadata. The indexed body is capped at **512 KB** (the same
FTS body cap used for all files); individual archive entries larger than 10 MB are skipped.

## PDF viewer

PDFs render with pdf.js. The viewer supports:

- **Zoom** — fit-width or actual-size default (configurable under **Settings → Documents**),
  with manual zoom up to 4×.
- **Scroll mode** — continuous scrolling or single-page navigation.
- **In-document search** and **page navigation**.
- **Document metadata** parsed from the file.

To go the other direction, Markdown notes export to PDF via Carbide's self-contained HTML
renderer (the bundled **PDF Export** plugin); see the README's _Document Rendering & Export_.
