# Shiki Syntax Highlighting — Implementation Notes (2026-03-16)

## Problem

Code blocks in the Milkdown editor used `@milkdown/plugin-prism` (Prism.js via Refractor) for syntax highlighting. Prism applies CSS class-based token decorations (`.token.keyword`, `.token.string`, etc.) which required maintaining a parallel set of `--syntax-*` CSS custom properties for light/dark themes. The highlighting quality was limited by Prism's tokenizer, which doesn't use TextMate grammars.

## Solution

Replaced Prism with [Shiki](https://shiki.style/) — a TextMate grammar-based highlighter that produces inline `style` attributes with precise color values from VS Code themes. This gives VS Code-quality syntax highlighting in the editor.

### Architecture

Three new files, one modified, CSS cleanup:

1. **`shiki_highlighter.ts`** — Singleton highlighter module
   - Uses `createHighlighterCoreSync` with `createJavaScriptRegexEngine` (no WASM dependency)
   - Bundles 33 language grammars statically (all popular languages + docker, diff, graphql, lua, scss, xml)
   - Two themes: `github-light` and `github-dark`
   - Language alias resolution (`js` → `javascript`, `sh` → `bash`, etc.)
   - Initialized eagerly at module load time (synchronous — ready before first keystroke)

2. **`shiki_plugin.ts`** — ProseMirror decoration plugin via `$prose()`
   - Walks the document tree, finds `code_block` nodes, tokenizes with Shiki
   - Applies `Decoration.inline()` with `style` attributes (color, font-style, font-weight)
   - Plugin state tracks current theme and decorations
   - Rebuilds decorations on doc change or theme change
   - `MutationObserver` on `document.documentElement[data-color-scheme]` detects theme switches and dispatches a meta transaction to trigger re-highlighting

3. **`milkdown_adapter.ts`** — Swapped `.use(prism)` → `.use(shiki_plugin)`, added `init_highlighter()` call

4. **`editor.css`** — Removed all `.token.*` Prism rules and `--syntax-*` CSS custom properties (Shiki uses inline styles, no CSS classes needed)

### Bundled Languages (33)

bash, c, cpp, csharp, css, diff, docker, go, graphql, html, java, javascript, json, jsx, kotlin, lua, markdown, php, python, ruby, rust, scss, sql, svelte, swift, toml, tsx, typescript, xml, yaml

Languages not bundled fall back to plain text (no highlighting). The language picker UI is unchanged — users can still select any language; only the highlighting is affected.

### Theme Behavior

- Follows the app's `data-color-scheme` attribute automatically
- Light mode → `github-light` theme
- Dark mode → `github-dark` theme
- Theme changes are detected via MutationObserver and trigger instant re-highlighting

## Dependencies

- **Added:** `shiki@4.0.2`
- **Removed:** `@milkdown/plugin-prism@7.18.0`, `prismjs@1.30.0`

Net dependency change: +23 packages (Shiki + TextMate grammars), -12 packages (Prism + Refractor).

## Testing

- `pnpm check` — 0 errors
- `pnpm test` — 1459 tests pass
- `pnpm lint` — no new errors (pre-existing excalidraw vendor warnings only)

## Future Improvements

- Configurable syntax theme selection (settings UI) — currently hardcoded to github-light/dark
- On-demand language loading for the long tail of languages
- Additional themes (dracula, nord, tokyo-night, etc.)
