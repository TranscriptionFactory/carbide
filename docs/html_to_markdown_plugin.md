# HTML to Markdown Plugin

Batch-converts `.html` files in your vault to Markdown using [Turndown](https://github.com/mixmark-io/turndown) with GFM support.

## Installation

The plugin ships in `plugins/html-to-markdown/`. To enable it:

1. Copy the `html-to-markdown/` folder into `<vault>/.carbide/plugins/`
2. Open the plugin manager (sidebar → Blocks icon)
3. Enable **HTML to Markdown**

## Usage

1. Open the command palette
2. Run **Convert HTML to Markdown**
3. The plugin scans all vault files for `.html` entries and converts each to a sibling `.md` file

### Behavior details

- If an `.md` file already exists at the target path, the file is **skipped** (no overwrite)
- A summary notice is shown on completion, e.g. `HTML→MD: 3 converted, 1 skipped (MD exists)`
- If no `.html` files are found, a notice reports that

### Supported HTML features

Turndown handles standard HTML elements. The bundled GFM plugin adds support for:

| HTML                                | Markdown output                   |
| ----------------------------------- | --------------------------------- |
| `<table>` with `<th>` heading row   | GFM pipe table                    |
| `<del>`, `<s>`, `<strike>`          | `~strikethrough~`                 |
| `<input type="checkbox">` in `<li>` | `- [x]` / `- [ ]` task list items |
| `<div class="highlight-source-*">`  | Fenced code block with language   |

Standard elements (headings, lists, links, images, code blocks, blockquotes, emphasis, horizontal rules) are all converted as expected.

## Settings

Configure via the plugin settings panel (plugin manager → HTML to Markdown → gear icon).

| Setting                | Options                                 | Default |
| ---------------------- | --------------------------------------- | ------- |
| **Heading style**      | ATX (`# Heading`) · Setext (underlined) | ATX     |
| **Bullet list marker** | `-` · `*` · `+`                         | `-`     |
| **Code block style**   | Fenced (` ``` `) · Indented             | Fenced  |

## Permissions

The plugin requests:

- `fs:read` — read `.html` files and check for existing `.md` siblings
- `fs:write` — create new `.md` files
- `commands:register` — register the command palette entry

## File structure

```
plugins/html-to-markdown/
├── manifest.json                        # Plugin metadata and settings schema
├── index.html                           # RPC client + conversion logic
└── vendor/
    ├── turndown.min.js                  # Turndown library (vendored)
    └── turndown-plugin-gfm.min.js       # GFM plugin (vendored)
```

## Limitations

- Converts all `.html` files in the vault in one batch; there is no single-file mode
- Does not delete or modify the original `.html` files
- Complex HTML (embedded scripts, CSS-only styling, iframes) may produce imperfect Markdown — review output for heavily styled pages
- Tables without a `<th>` heading row are kept as raw HTML (Turndown/GFM limitation)
