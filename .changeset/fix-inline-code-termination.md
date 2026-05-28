---
"carbide": patch
---

### Fixes

- **Inline code (and other inline marks) did not terminate after the closing delimiter**: After commit `04337ff7` made `code_inline`, `strikethrough`, and `highlight` inclusive (so they can be extended by typing inside the marked range), typing `` `foo` `` via the input rule left the code mark as a stored mark at the cursor. The next typed character was then absorbed into the inline code run, and the same applied to bold/italic/highlight. The four inline-mark input rules now call `tr.removeStoredMark(mark_type)` after applying the mark, so subsequent typing produces plain text. Extending an existing mark by positioning the cursor inside it still works, and the existing `ArrowRight` escape behavior is unchanged.
