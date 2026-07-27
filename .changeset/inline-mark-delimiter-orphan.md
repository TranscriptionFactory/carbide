---
"carbide": patch
---

fix(editor): backspacing a revealed inline-mark delimiter keeps its partner

Deleting either delimiter of a revealed inline mark now drops the mark and leaves the opposite delimiter behind as literal text (`**bold**` → `**bold`), the way source-level editing behaves; previously both delimiters vanished together. Backspace at a span's start boundary is handled too, taking precedence over block joining when the span opens the block.
