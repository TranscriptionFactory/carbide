---
"carbide": minor
---

feat(editor): copy a link to any block

Block anchors could be parsed, suggested and transcluded, but nothing in the app could create one — you had to type the `^id` by hand.

- **Copy Block Link** and **Copy Block ID** are in the block context menu. The first use mints a short id and appends it to the block; later uses reuse the existing id rather than appending a second one.
- The copied `[[note#^id]]` navigates to that block, and the ` ^id` survives a save/reload round-trip.
- Works on paragraphs, headings, quotes, lists, callouts and collapsible blocks. Hidden on blocks that cannot meaningfully carry an id — code and raw HTML (where the id would land in the content), embeds, images, math, and tables.

A block whose only content is its own `^id` is now recognised as an anchor, matching Obsidian; previously such a link was silently dead.
