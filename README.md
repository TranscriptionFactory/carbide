<img src="./assets/carbide_updated.png" alt="Carbide" width="235">

[![Release](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml/badge.svg)](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml)

# Carbide

Carbide is a local-first Markdown workbench for notes, research, tasks, source control, AI workflows, and plugins. Vaults are ordinary folders on disk. Carbide adds rich editing, search, links, Git history, document viewers, AI tooling, and MCP/plugin integrations around those files.

Carbide started as a fork of [Otterly](https://github.com/ajkdrag/otterly). The project now has its own UI, search stack, language tooling, source-control workflow, AI surfaces, and extension system.

## Why the name?

Miners once dropped calcium carbide into water to produce acetylene flame for their lamps. Carbide borrows that image: a bright tool for moving through large local knowledge bases. The icon uses Markdown symbols (`>` and `*`) as the lamp flame.

## Highlights

- **Plain-folder vaults**: Notes, settings, indexes, attachments, references, and plugins stay on disk in portable formats.
- **Markdown editing**: ProseMirror and CodeMirror support visual/source editing, wikilinks, transclusions, callouts, tables, code blocks, KaTeX, Mermaid, outlines, and daily notes.
- **Search and navigation**: Omnibar, inline `@` palette, SQLite FTS5, semantic embeddings, structured note/task queries, saved `.query` files, tags, backlinks, graph views, and Bases over frontmatter.
- **Documents**: In-app viewers for PDF, images, code, HTML, CSV, and Excalidraw, plus an EPUB reader with in-book search and reading-position resume, with each book full-text indexed into vault search. Markdown-to-PDF export includes images, Mermaid diagrams, SVG, and KaTeX math.
- **HTML artifacts**: Search, link, embed, and render `.html` files in Source, Safe, or Live mode with explicit trust grants. See [HTML Artifacts](docs/html_artifacts.md).
- **Web clipping**: Save any page into the vault — direct fetch or a JS-capable capture window, readability extraction, localized images, and provenance frontmatter — as Markdown, a searchable HTML artifact, or an EPUB you read in-app. See [Web Clipping](docs/web_clipping.md).
- **Tasks and planning**: Markdown tasks with status cycling, due dates, list/kanban/schedule views, quick capture, and embedded task-query results.
- **References**: Citation library, BibTeX/CSL/RIS import and export, Zotero Better BibTeX search/import/sync, bibliography export, and linked PDF/HTML source folders.
- **Git workflow**: Init, status, stage, commit, checkpoint, diff, restore, remotes, sync, and optional auto-commit on save.
- **AI and Vault Chat**: CLI providers and local OpenAI-compatible servers power inline ask/edit and citation-backed vault chat over hybrid retrieval.
- **Plugins and MCP**: Sandboxed plugins, marketplace flows, permissioned SDK/RPC APIs, bundled plugins, Carbide MCP tools, and plugin-hosted MCP sidecars.
- **Language tools**: Markdown LSP support via IWE, Markdown Oxide, Marksman, and rumdl, plus code LSP discovery for common programming languages.

## Install

### Homebrew on macOS

```bash
brew install --cask TranscriptionFactory/tap/carbide
```

### GitHub Releases

Download a build from [Releases](https://github.com/TranscriptionFactory/carbide/releases):

| Platform            | Format           |
| ------------------- | ---------------- |
| macOS Apple Silicon | `.dmg` aarch64   |
| macOS Intel         | `.dmg` x64       |
| Windows             | `.msi`           |
| Linux               | `.deb`, AppImage |

The built-in updater checks for updates on startup.

### macOS Gatekeeper

If macOS reports that Carbide is damaged, clear the quarantine flag:

```bash
xattr -cr /Applications/carbide.app
```

You can also open **System Settings → Privacy & Security** and choose **Open Anyway**.

## Documentation

- [Getting Started](docs/getting_started.md): first launch, vaults, command palette, search, AI, and documents.
- [Search & Queries](docs/search_and_queries.md): omnibar, inline `@` palette, query language, graph search, Bases, and task queries.
- [Language Tools](docs/language_tools.md): Markdown and code LSP servers, linting, and native-vs-LSP toggles.
- [Bases & References](docs/bases_and_references.md): frontmatter views, citations, linked sources, and Zotero.
- [AI & Vault Chat](docs/ai_and_chat.md): providers, inline ask/edit, retrieval, citations, and MCP chat tools.
- [Markdown Syntax Guide](docs/markdown-syntax-guide.md): supported Markdown, embeds, callouts, math, and diagrams.
- [HTML Artifacts](docs/html_artifacts.md): render modes, trust grants, transclusion, paste-as-artifact, and provenance.
- [Document Viewers](docs/document_viewers.md): PDF, EPUB, image, HTML, CSV, code, and reading-position support.
- [Web Clipping](docs/web_clipping.md): clip pages to Markdown, HTML artifacts, or EPUB with image localization and provenance.
- [Data Storage](docs/data_storage_locations.md): vault data, app settings, caches, indexes, plugins, and logs.
- [Plugin How-To](docs/plugin_howto.md): manifests, permissions, SDK APIs, marketplace packaging, and sidecars.
- [Architecture](docs/architecture.md): decision tree, feature anatomy, layering rules, and project structure.
- [UI Design System](docs/UI.md): tokens, shadcn conventions, and styling rules.

## Develop

Carbide uses Tauri 2, Svelte 5, SvelteKit, TypeScript, Rust, Vite, Tailwind CSS 4, shadcn-svelte, ProseMirror, CodeMirror, SQLite, git2, and Vitest.

```bash
pnpm install
pnpm dev
```

Validation:

```bash
pnpm check
pnpm lint
pnpm test
cd src-tauri && cargo check
pnpm format
```

Project rules live in [Architecture](docs/architecture.md). Add feature code by following its decision tree: ports/adapters for IO, stores for sync domain state, services for async use cases, actions for user-triggered behavior, and reactors for store-driven side effects.

## Bundled plugins

Carbide ships with these example and utility plugins:

- Auto-Tag — auto-prefix configured words with `#`
- HTML Strip — strip styles, scripts, and metadata from HTML
- HTML to Markdown — convert HTML to Markdown via Turndown
- PDF Export — export a note to PDF with Mermaid and LaTeX
- Slides Export — export a note to a slide-deck PDF, split on `---`
- Smart Templates — context-aware Handlebars templates with live preview
- Wiki Compiler — compile vault notes into an interlinked wiki via LLM

Plugin manifests live under [`plugins/`](plugins/). User-installed plugins live in each vault under `.carbide/plugins/`.

## Acknowledgments

Carbide began as a fork of [Otterly](https://github.com/ajkdrag/otterly). It also draws file-management ideas from [Ferrite](https://github.com/OlaProeis/Ferrite).

## License

Carbide is licensed under the [GNU General Public License v3.0](LICENSE). It contains code derived from the MIT-licensed [Otterly](https://github.com/ajkdrag/otterly) project, and draws file-management ideas from [Ferrite](https://github.com/OlaProeis/Ferrite) (also MIT). Copyright notices and license texts are reproduced in [NOTICE](NOTICE).
