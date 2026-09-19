---
"carbide": patch
---

Suggestion dropdowns no longer squash their rows to fit the box. Once a list passed ten rows the `notes with ` picker in the Query tab, the task panel's `tag includes ` picker and the folder-path picker each shrank every row until only a partial line of each entry was visible, and neither scrolling nor arrow-key highlighting could reach the rest. Every row now keeps its natural height and the list scrolls.

The sidebar Tags panel had a separate problem in the same area: its tag list was clipped at the panel edge and could not scroll, so the last children of a long nested tag could not be reached at all. The list now scrolls and every child row is reachable. The tag rows themselves were never squashed.

The sidebar Task panel's `tag includes ` suggestion now lists the tags you promoted, matching the Query tab, instead of every tag in the vault.
