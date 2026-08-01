---
"carbide": minor
---

feat(editor): correct block context-menu targeting and add insert actions

- **Right-click no longer deletes the wrong block**: pointer-to-block resolution ignored the browser's `inside` hint, so atom node views (embeds, images, math, callouts) resolved to nothing and the menu silently fell back to acting on the _caret's_ block instead. Targeting now uses the pointed-at node, with a DOM-based fallback, and an unresolved target is a no-op rather than a destructive guess.
- **Copy, Duplicate and Delete agree on their target** for single-block selections.
- **Insert Above / Insert Below** are available from the block menu.
- **Embeds, videos, note embeds and raw HTML blocks are draggable**, matching the other block types.
- The caret stays in a valid position after deleting a block next to an atom, and right-clicking an image no longer opens two menus.
