# Markdown Syntax Audit — 2026-03-18

Audit of `docs/markdown-syntax-guide.md` against the ProseMirror visual editor implementation.

---

## Fully Implemented

| Feature                                                | Evidence                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| **Wikilinks** `[[Note]]` with aliases `[[Note\|text]]` | `wiki_link_plugin.ts`, `wiki_suggest_plugin.ts`                    |
| **Markdown links** `[text](url)`                       | `markdown_link_input_rule.ts`, link mark in schema                 |
| **Image embedding** `![alt](url)`                      | `image` + `image-block` nodes, `image_input_rule_plugin.ts`        |
| **Excalidraw embeds** `![[file.excalidraw]]`           | `excalidraw_embed_plugin.ts`, `excalidraw_embed_view_plugin.ts`    |
| **YAML frontmatter** `---` delimiters                  | `frontmatter` node, `markdown-it-front-matter` plugin              |
| **Inline math** `$...$`                                | `math_inline` node, KaTeX rendering, input rule                    |
| **Block math** `$$...$$`                               | `math_block` node, KaTeX rendering                                 |
| **Mermaid diagrams**                                   | `code_block_view_plugin.ts` — auto-renders mermaid language blocks |
| **Bold** `**text**`                                    | `strong` mark                                                      |
| **Italic** `*text*` / `_text_`                         | `em` mark                                                          |
| **Strikethrough** `~~text~~`                           | `strikethrough` mark + input rule + Mod-Shift-X                    |
| **Inline code** `` `code` ``                           | `code_inline` mark                                                 |
| **Fenced code blocks** with syntax highlighting        | `code_block` node, Shiki plugin, 50+ languages                     |
| **Headings** `# ` through `###### `                    | `heading` node with input rule                                     |
| **Horizontal rules** `---`                             | `hr` node with input rule                                          |
| **Blockquotes** `> text`                               | `blockquote` node with input rule                                  |
| **Unordered lists** `- ` / `* `                        | `bullet_list` node with input rule                                 |
| **Ordered lists** `1. `                                | `ordered_list` node with input rule                                |
| **Nested lists**                                       | `list_item` content allows nested blocks                           |
| **Task lists** `- [ ]` / `- [x]`                       | `list_item.checked` attr, `task_keymap_plugin.ts`                  |
| **Tables** with alignment                              | Full table node hierarchy, `table_toolbar_prose_plugin`            |
| **Hard line breaks**                                   | `hardbreak` node, Shift+Enter                                      |
| **Emoji** `:emoji:` shortcodes                         | `emoji_plugin.ts`                                                  |
| **Smart typography** arrows, quotes                    | `typography_plugin.ts`                                             |

---

## Partially Implemented

| Feature                              | What works                                           | What's missing                                                    |
| ------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------- |
| **Heading links** `[[Note#Heading]]` | Wikilink regex accepts `#`                           | No heading anchor resolution on navigation                        |
| **Image resizing** `![[img\|400]]`   | `image_width_plugin.ts` exists, width attr in schema | Pipe syntax parsing unconfirmed                                   |
| **Frontmatter properties**           | Raw YAML parsed and editable                         | No structured property editor (types, dates, lists)               |
| **Callouts** `> [!note]`             | Blockquotes render, slash command exists             | No `[!type]` parsing, no typed callout rendering, no icons/colors |
| **Code block line numbers**          | Source editor has gutter                             | Visual editor code blocks don't show line numbers                 |
| **Table cell formatting**            | Inline marks work in cells                           | Complex content (images, wikilinks) untested                      |

---

## Not Implemented

### High-value gaps (likely expected by users)

| Feature              | Syntax                          | Difficulty                                       |
| -------------------- | ------------------------------- | ------------------------------------------------ |
| **Highlights**       | `==text==`                      | Low — add mark + input rule (like strikethrough) |
| **Comments**         | `%% hidden %%`                  | Low — parse to hidden node or strip              |
| **Footnotes**        | `[^1]` / `[^1]: text`           | Medium — new node types + popup/inline rendering |
| **Callout types**    | `> [!warning]`, `> [!tip]` etc. | Medium — blockquote subtype detection + CSS      |
| **Note embeds**      | `![[Note]]` transclusion        | Medium — resolve + render inline                 |
| **Block references** | `[[Note#^block-id]]`            | Medium — block ID generation + resolution        |
| **Inline tags**      | `#tag`                          | Low-Medium — mark or decoration + tag index      |

### Lower priority / Obsidian-specific

| Feature                        | Notes                                                  |
| ------------------------------ | ------------------------------------------------------ |
| **PDF embeds** `![[file.pdf]]` | Requires inline PDF viewer                             |
| **Audio/Video embeds**         | `![[file.mp3]]`, `![[file.mp4]]`                       |
| **iframe embeds**              | HTML disabled (`html: false` in markdown-it)           |
| **Extended task statuses**     | `[/]`, `[-]`, `[>]` etc. — theme-dependent in Obsidian |
| **Definition lists**           | `term\n: definition`                                   |
| **Superscript/Subscript**      | `<sup>`, `<sub>` — requires HTML parsing               |
| **Underline**                  | `<u>text</u>` — requires HTML parsing                  |
| **Unlinked mentions**          | Requires full-text scanning of vault                   |
| **Templates**                  | `{{date}}`, `{{title}}` variable substitution          |
| **Obsidian URI scheme**        | `obsidian://` protocol handling                        |
| **Dataview / query blocks**    | Plugin-level features                                  |
| **Canvas editing**             | `.canvas` JSON format editor                           |
| **`<details>` collapsible**    | Requires HTML block support                            |
| **CSS snippets per-note**      | `cssclasses` frontmatter property                      |

---

## Recommended Quick Wins

These can be added with minimal effort (similar to the strikethrough fix):

1. **`==highlight==` mark** — New mark in schema + input rule + `Mod-Shift-H` keymap. Exact same pattern as strikethrough.
2. **`%% comment %%` support** — Parse to invisible node in visual mode, preserve in source. Could use markdown-it plugin.
3. **Callout `[!type]` detection** — Parse first line of blockquote for `[!type]` pattern, apply CSS class for styled rendering.
4. **`#tag` recognition** — Decoration plugin (no schema change needed) that visually styles `#word` patterns.

---

## Coverage Summary

- **Fully implemented:** 24 features
- **Partially implemented:** 6 features
- **Not implemented:** ~20 features (7 high-value, 13 lower priority/Obsidian-specific)
