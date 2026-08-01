---
"carbide": minor
---

feat(export): export a note as HTML or EPUB, and copy it as rich HTML

- **Export as HTML** writes a standalone document — math, diagrams and images are inlined, so the file opens correctly on its own.
- **Export as EPUB** reuses the EPUB3 writer built for web clipping, generalized to serve notes as well (optional source URL, generated identifier, stylesheet manifest entry). Single-chapter for now.
- **Copy as HTML** was a dead command palette entry with no handler behind it; it now renders the note body and writes rich HTML to the clipboard, so it pastes formatted.
- **Raw HTML in PDF export** renders as a syntax-highlighted code block, and promoted embeds render as a labelled placeholder with their URL, instead of being dropped. Raw HTML is still not executed.

No new dependencies. Web-clip EPUB export is unchanged.
