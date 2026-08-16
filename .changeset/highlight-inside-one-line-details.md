---
"carbide": patch
---

Highlight `==marked==` text inside a one-line `<details>`

Writing a collapsible section on a single line —
`<details><summary>Title</summary>Some ==marked== text</details>` — rendered the
highlight as literal `==marked==` instead of highlighted text. The same note
written with blank lines around the body highlighted correctly, so the two ways
of writing a collapsible disagreed with each other.

Highlights were being applied before collapsibles and callouts were recognised.
On the one-line form the body is still an undivided block of HTML at that point,
so there is no text for the highlighter to mark, and it never gets a second
look. Highlights are now applied after collapsibles and callouts have been split
out, so the body is real text by the time they run.

A `<summary>` title containing `==marked==` now highlights too, in both the
one-line and blank-line forms; previously neither did.

Callouts inside collapsibles, and highlights in every other container
(callouts, blockquotes, lists, table cells), are unchanged.
