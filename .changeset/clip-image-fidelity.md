---
"carbide": patch
---

Web clipping keeps far more of a page's images and diagrams. Images are downloaded six at a time, up to 500 per page (was 20); any over the limit are listed in the clip toast. Inline SVG diagrams, including their embedded and lazy-loaded thumbnails, now survive in clipped HTML and in the HTML viewer, which also stops dropping `viewBox` from every inline SVG. Figures are no longer gutted by Readability's cleanup, so thumbnail grids and click-to-select galleries inside `<figure>` come through. Markdown clips no longer collect stray SVG label text.
