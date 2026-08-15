---
"carbide": patch
---

Stop copied text from carrying callout and collapsible markup

Selecting part of a callout and copying it pasted `> [!note] Title` and a `> `
prefix on every line, even though the selection was plain prose. The same
happened with collapsible sections, which pasted a full `<details>` and
`<summary>` block. Whether it happened depended on where the selection started:
dragging from the callout's title — the natural gesture — carried the markup,
while starting inside the body did not.

Worse, a selection that covered only the callout title or only the collapsible
summary copied **nothing at all**. The clipboard came back empty with no
indication anything had gone wrong.

Copying a partial selection now yields exactly the text that was selected, with
no callout or collapsible markup around it. Copying a whole callout or
collapsible — by selecting the block or using the block menu's Copy — still
produces `> [!note] …` and `<details>…</details>` as before, and a callout that
sits untouched inside a wider selection keeps its markup too.
