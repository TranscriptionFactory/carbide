---
"carbide": patch
---

fix(editor): persist collapse on language-less code blocks and stop wide-mode drag handles overlapping content

- Code-block collapse now survives save→reload even when the fence has no language. remark only emits fence meta when a language is present (and any info-string on a bare fence re-parses as the language), so the `collapsed` token was silently dropped for language-less blocks. The no-language case now encodes the flag in the lang slot (` ```collapsed `) and decodes it back — idempotent (expand → bare fence) and Obsidian-safe. Languaged blocks (query, mermaid, ```js) already persisted.
- In wide width mode the block drag handles no longer overlap the content column. They are now anchored by their right edge just left of the text (growing leftward into the padding) instead of by a fixed left offset that assumed the normal-mode gutter.
