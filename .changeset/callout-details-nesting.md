---
"carbide": patch
---

Parse nested callouts and collapsible sections instead of showing raw HTML

A callout written inside another callout, or inside a plain blockquote, stayed a
quoted block: the inner `[!warning]` line was rendered as literal text rather
than becoming a callout. A `<details>` block written inside a callout was worse
— it showed the raw `<details>`, `<summary>` and `</details>` tags as visible
text in the callout body, because the collapsible was never recognised there at
all. The reverse nesting failed too: a callout written inside a `<details>`
block came out as an ordinary quote.

Markdown conversion only ever looked at the top level of a note, so anything
written one level in was left as-is. It now descends through blockquotes,
callout bodies and collapsible content, so callouts and collapsibles are
recognised wherever they are nested and in either order. Existing notes pick
this up on open, and the nested forms round-trip back to the same markdown they
were written as.

Inline HTML in ordinary prose is untouched — writing about the `<details>` tag
mid-sentence still stays plain text.

Embeds written inside a callout or a collapsible now work too. An image or note
embed such as `![[diagram.png]]` inside a callout was previously left as plain
text, and saving the note rewrote it to `\![[diagram.png]]` — an escaped form
that no longer means an embed, so the picture never came back. An `<iframe>` or
`<video>` in the same position stayed visible as raw HTML markup instead of
becoming a player. Both are now recognised inside callouts and collapsibles, at
any nesting depth, and saving no longer rewrites the embed syntax. Embeds in
blockquotes and list items behave as they did before.
