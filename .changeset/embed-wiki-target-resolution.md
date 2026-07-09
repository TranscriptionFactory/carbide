---
"carbide": patch
---

Editor: `![[note]]` and `![[file.pdf]]` embeds now resolve their targets like wiki links (exact → case-insensitive → basename lookup), so transclusions load when the target lives in a subfolder or differs in casing.
