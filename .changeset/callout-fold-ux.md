---
"carbide": minor
---

feat(editor): callout fold UX

- **Mod+Enter now works where it was dead**: the fold toggle no longer bails on a non-empty selection, so callouts inserted by the slash command — which arrive collapsed with their title selected — can be toggled immediately. The toggle also accepts a selection anywhere inside the callout body, not just the title.
- **Collapsed callouts can always be reopened**: `foldable: false` callouts (markdown-parsed and turn-into) previously could not be opened once collapsed. The `foldable` gate now applies only to _collapsing_, never to opening.
- **Collapsing keeps the callout in view**: the caret parks at the end of the title and scrolls into view, so the viewport no longer jumps.
- **Chevron and header placement**: the header is top-anchored instead of vertically centred, and sticks to the top of a tall callout while scrolling so the title and chevron stay reachable.
