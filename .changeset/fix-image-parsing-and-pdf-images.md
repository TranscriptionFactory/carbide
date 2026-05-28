---
"carbide": patch
---

### Fixes

- **Image markdown collapses surrounding linebreaks**: Inserting a canonical `![alt](url)` image (and subsequently switching between source/visual or saving) collapsed every block in the document onto one line. The `image-block` ProseMirror node was being serialized as a top-level mdast `image` (phrasing) node, which is malformed at block level — `remark-stringify` dropped the blank lines between every sibling. `pm_to_mdast` now wraps the image in a `paragraph` mdast node so adjacent blocks keep their separators.
- **Images do not render in exported PDFs**: The hidden export webview loads from `pdfexport://localhost/` with a strict CSP, so `carbide-asset://` URLs, relative paths, `file://` paths, and remote URLs were all blocked. `render_note_to_html` now accepts an optional `image_resolver` callback, pre-resolves every image src (canonical `![alt](path)`, wiki-embed `![[image.png]]`, absolute paths, and `http(s)` URLs) to a data URI, and inlines them into the HTML before printing. Wiki-embeds whose target is not an image extension are left untouched. Failed loads render a faint placeholder with the alt text so the document flow stays intact.
