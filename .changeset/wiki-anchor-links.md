---
"carbide": patch
---

fix(editor): stop corrupting wiki links that carry a heading or block anchor

- **`[[note#Heading]]` no longer breaks on save**: the `.md` extension was appended _after_ the fragment (`note#Heading.md`), and no wiki stringify handler existed, so a typed anchor link persisted to disk as a broken markdown link. The extension now extends only the path portion, and wiki links round-trip back to `[[...]]` unchanged.
- **Anchor links navigate**: `[[note#Heading]]` and `[[#Heading]]` scroll to the heading, and `[[note#^block-id]]` scrolls to the anchored block.
- **Anchor links read as `note > Heading`** instead of exposing the raw target, and the `@` palette no longer inserts a visible `.md`.
- **Heading fragment matching uses one slugger** — the outline panel's separate variant disagreed with the wiki slug on non-word characters.
- **`@#` with no query shows the legend** rather than an empty dropdown.

Also fixes the `[[` suggester dropping the embed flag, leaking block results into note tab-completion, and sharing mutable state across editor instances.
