---
"carbide": patch
---

fix(editor): typing inside a revealed inline mark no longer eats its syntax

- **Backspace at a run's end** deletes a character again instead of unwrapping the whole run and orphaning a delimiter — while typing inside bold the caret is always at the run's end, so every Backspace used to strip the mark without deleting anything. It also stops shadowing `undoInputRule`, so typing `**bold**` and pressing Backspace restores the literal text.
- **Type-to-close**: typing a run's closing delimiter at its end exits the run rather than inserting the delimiter as marked text. Two-character delimiters (`**`, `~~`, `==`) exit when the second character completes the pair; a delimiter character that does not complete a pair stays literal, so nested emphasis still works.
- **IME safety**: Backspace and text-input handling defer to the composition.

Backspacing at a run's start still unwraps the mark and leaves the closing delimiter behind as literal text.
