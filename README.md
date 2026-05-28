<img src="./assets/carbide_icon.jpg" alt="Carbide" width="235">

[![Release](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml/badge.svg)](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml)

# Carbide

> **Fork of [Otterly](https://github.com/ajkdrag/otterly)** — Carbide extends Otterly with a redesigned UI, deeper search/query workflows, language intelligence, source control, AI, and an extensible plugin/MCP platform.

Carbide is a local-first Markdown workbench for notes, documents, tasks, references, graphs, and plugin-assisted workflows. Vaults are ordinary folders on disk; Carbide adds editing, search, links, Git history, document export, AI tooling, and MCP/plugin integrations around those files.

### Why "Carbide"?

Before modern flashlights, coal miners dropped **calcium carbide** into water to produce a bright acetylene flame in their lamps to navigate deep tunnels. The icon depicts a miner's lamp with Markdown symbols (`>` and `*`) forming the flame because Carbide is built for navigating deep personal knowledge bases with local files, search, graph views, language tools, and extensibility.

## What it does

- **Local-first Markdown vaults**: Vaults are folders on disk. Notes, canvases, query files, settings, indexes, references, plugins, and generated metadata remain inspectable and portable.
- **Editing and document work**: Visual/source Markdown editing, syntax highlighting, wikilinks, embeds, folding, outline navigation, find/replace, image workflows, PDF/document viewing, and Markdown-to-PDF export.
- **Search, queries, and metadata views**: Hybrid FTS + semantic search, omnibar, inline `@` palette, composable note/task queries, search graph, and Bases views over frontmatter.
- **Graph and relationship views**: Full-vault graph, active-note graph, search graph, backlinks/outlinks, attachments, semantic connections, smart-link edges, and hierarchy/canvas views.
- **Language intelligence**: LSP infrastructure for Markdown and code, with diagnostics, hovers, code actions, completion, rename/definition support, and managed Markdown tooling when available.
- **Tasks and planning**: Markdown-native tasks with list, kanban, schedule, query, grouping, sorting, relative due dates, and quick-capture flows.
- **Git-aware workflow**: Repository initialization, status, staging, commits, checkpoints, history, diffs, restore, remotes, push/fetch/pull/sync, and optional auto-commit on save.
- **References and linked sources**: BibTeX/CSL/RIS import, Zotero Better BibTeX integration, citation picker, bibliography export, linked PDF/HTML source folders, metadata extraction, and annotation sync.
- **AI assistance**: Configurable CLI-based providers, inline AI edits, ask/edit modes, prompt composition from vault/editor context, and AI-generated file descriptions.
- **Extensibility and MCP**: Sandboxed plugins, marketplace install/update/uninstall flows, a permissioned plugin SDK/RPC surface, Carbide's own MCP server, and plugin-hosted external MCP sidecars.

---

## Installation

### Homebrew (macOS)

```bash
brew install --cask TranscriptionFactory/tap/carbide
```

### GitHub Releases

Download pre-built binaries from the [Releases](https://github.com/TranscriptionFactory/carbide/releases) page:

| Platform              | Format              |
| --------------------- | ------------------- |
| macOS (Apple Silicon) | `.dmg` (aarch64)    |
| macOS (Intel)         | `.dmg` (x64)        |
| Windows               | `.msi`              |
| Linux                 | `.deb`, `.AppImage` |

A built-in auto-updater applies updates on startup.

### macOS Gatekeeper

Mac users may see **"Carbide is damaged and cannot be opened"** because the app isn't signed with an Apple developer key. Fix it by running:

```bash
xattr -cr /Applications/carbide.app
```

Or open **System Settings → Privacy & Security** and click **Open Anyway** in the Security section.

---

## Features

### Markdown Editing & Documents

- Visual Markdown editor and source mode with ProseMirror/CodeMirror-based editing
- Live Markdown rendering, Shiki syntax highlighting, KaTeX math, callouts, details blocks, tables, lists, and code blocks
- Wikilinks, heading links, block references, backlink tracking, autocomplete, unresolved-link diagnostics, and rename-aware link repair
- Inline embeds for notes, headings, blocks, images, PDFs, audio/video, files, and Mermaid diagrams
- Collapsible code blocks, file embeds, and note embeds
- Split editing, draggable tabs, pinned/reopened tabs, side-by-side panes, read-only mode, line numbers, zoom, zen mode, and focus mode
- Document outline, collapsible headings, block transforms, block drag-and-drop, and Vim-style navigation for the file tree, outline, and editor
- Find/replace in file, copy as Markdown/HTML, paste HTML as Markdown, image paste/drop workflows, image alt text/resize/save/delete actions
- PDF viewing, image/code/HTML/CSV viewers, Excalidraw canvas files, Mermaid rendering, and external document/viewer windows
- Daily notes and configurable note naming templates

### Document Rendering & Export

- Markdown-to-PDF export using a self-contained HTML renderer and native platform PDF capture
- PDF export renders Mermaid diagrams and KaTeX-rendered LaTeX-style inline and block math
- Exported notes include syntax-highlighted code blocks, tables, callouts/details blocks, and document styling
- Mermaid diagram export to SVG through the native save dialog
- Mermaid rendering in slides export
- Linked PDF/HTML source folders, attachment links, and in-app document viewers keep source files accessible without moving them out of the vault

### Search, Queries & Navigation

- **Omnibar** (`Cmd+K` / `Ctrl+K`): unified entry point for notes, commands, settings, wiki links, and cross-vault search
- **Inline `@` palette**: insert notes, all files, Markdown-only matches, headings, dates, tags, citations, and commands from inside the editor
- **Hybrid search**: SQLite FTS5 + local semantic embeddings merged with Reciprocal Rank Fusion
- **Structured query language**: clause-based note/file/folder queries using `named`, `with`, `in`, `linked from`, and `with_property`, with boolean composition, regex, tags, wikilinks, subqueries, and saveable `.query` files
- **Search graph**: tabbed graph/results view for query hits plus 1-hop neighbors, multi-selection, neighbor hiding, score filtering, cross-highlighting, edge toggles, progressive expansion, and persisted tab state
- **Bases**: UI-driven metadata views over frontmatter with search/filter/sort/pagination, table/list/kanban/gallery/calendar layouts, saved JSON views, and property updates from kanban drag-and-drop
- **Task queries**: line-based DSL for filtering tasks by status, path, section, text, tags, and due date, with boolean operators, relative date expressions, sorting, grouping, and limits
- **Block/section-level discovery**: semantic indexing for related-note and related-section workflows

See [Search & Queries](docs/search_and_queries.md) for syntax and details.

### Tasks & Planning

- Markdown-native tasks (`[ ]`, `[-]`, `[x]`) with 3-state cycling
- Due dates stored inline and editable from task views
- Task list, kanban, and schedule views
- Quick capture from app/menu actions
- Filters for status, path, section, text, tags, due dates, missing/present due dates, sort order, grouping, and result limits
- Boolean task queries with `AND`, `OR`, `NOT`, plus relative due dates such as today, this week, next N days, and last week
- Embedded task query results with source-note navigation and in-place status toggles
- Task progress/aggregates surfaced through metadata and Bases-style workflows

### Graph, Links & Canvas

- Full-vault and active-note graph views
- Search graph for query-centered exploration, with multi-select, score filtering, and optional neighbor hiding
- Backlinks, outgoing links, attachments, smart links, semantic similarity edges, and toggleable edge types
- WebGL/Pixi graph rendering with worker-based force simulation for larger vaults
- Fuzzy graph filtering, cluster detection, focus mode, radial layout, and canvas export
- Graph-to-canvas export with note content loading, embedded Markdown in file nodes, click-to-open behavior, and edge labels
- Hierarchy tree view for Markdown/LSP-derived structure
- Excalidraw canvas support and Mermaid diagram rendering with cached output

### Language Intelligence & Tooling

- General LSP results panel for diagnostics, hover, code actions, and workspace edits
- Markdown LSP providers: IWE, Markdown Oxide, and Marksman, with fallback/provider resolution
- Code LSP support for Python, Rust, TypeScript, JavaScript, Go, JSON, and YAML when the corresponding language server is available
- Managed toolchain for installing and resolving Markdown tools such as rumdl, IWE, Markdown Oxide, and Marksman
- Markdown linting/formatting/fix actions through rumdl-backed diagnostics and code actions
- IWE structural transforms for Markdown: extract/inline sections, inline quotes, list↔section conversion, list sorting, link creation, and provider config management

### AI Assistance

- Built-in CLI provider presets for Claude Code, Codex, and Ollama, plus configurable provider definitions
- Auto-provider resolution based on local CLI availability
- Ask/edit modes over the current note or selection
- Inline AI menu with accept/reject flow
- Prompt builder for composing requests from vault and editor context, with configurable vault-context settings
- AI-generated file tree descriptions and plugin-accessible AI execution

### References, Citations & Linked Sources

- Citation library backed by CSL-JSON with BibTeX, CSL, and RIS import/export via Citation.js
- Zotero Better BibTeX extension integration with connection testing, live search, import, and annotation sync
- Citation picker that inserts `[@citekey]`
- Bibliography rendering/export
- Linked source folders for PDF/HTML directories with metadata extraction, search inclusion, relocation, rescan, and missing-source handling
- Frontmatter sync for reference metadata and citation-related properties

See [Bases & References](docs/bases_and_references.md) for details.

### Git & Source Control

- Initialize Git repositories from a vault
- Status, staging, unstaging, staged commits, commit-all, and file diffs
- Checkpoints for named snapshots
- Version history with load-more, selected commit preview, and restore
- Remote management, push, fetch, pull, and sync
- Optional auto-commit on save

### Plugins, MCP & Extensibility

- Iframe-sandboxed plugin runtime with lifecycle controls, plugin manager UI, marketplace browsing, install/update/uninstall flows, and per-plugin settings
- Permission-gated plugin APIs for vault IO, editor access/modification, commands, UI contributions, settings, events, search, metadata, diagnostics, network fetch, AI execution, export, and external sidecars
- Plugin contributions for commands, command palette entries, sidebar panels, status bar items, ribbon icons, and settings schemas
- Bundled plugins: Auto-Tag, HTML Strip, HTML to Markdown, PDF Export, Slides Export, Smart Templates, and Wiki Compiler
- Carbide MCP server with authenticated HTTP/CLI setup flows for Claude Desktop and Claude Code
- MCP tools for vault discovery, notes CRUD, append/prepend, semantic search/reindex, task queries, graph links, metadata/properties, frontmatter updates, references, and Git operations
- External MCP sidecars: plugins can start MCP-compatible binaries, list/call tools, check status, and stop isolated server instances through the `sidecar.*` SDK

See [Plugin How-To](docs/plugin_howto.md) for the plugin SDK and RPC surface.

### Layout & Customization

- Multiple sidebar views: explorer, dashboard, starred notes, graph, tasks, tags, source control, and daily notes
- 20+ built-in themes with light/dark variants
- Layout variants, activity/sidebar controls, context rail, outline/tasks panels, zen/focus modes, and per-vault settings
- CSS token editor, inline editing, revert flow, and shadcn/Tailwind semantic styling
- Rebindable hotkeys and command-palette driven actions
- File tree style variants and starred notes/folders

### More

- Embedded terminal with multiple sessions, respawn, and WebGL xterm rendering
- File watcher, atomic writes, asset cache, and indexed metadata pipeline
- Tags panel with hierarchical tag tree, prefix selection, and tag-based note opening
- Settings migration and per-vault/global storage documented in [Data Storage](docs/data_storage_locations.md)

---

## Tech Stack

| Layer             | Technology                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Shell             | Tauri 2, tauri-specta, Tauri updater/dialog/log/opener/window-state/single-instance plugins                                             |
| Frontend          | Svelte 5, SvelteKit, TypeScript, Vite, Tailwind CSS 4, shadcn-svelte, bits-ui, paneforge                                                |
| Editor            | ProseMirror, CodeMirror 6, Shiki, KaTeX, markdown-it, unified/remark/mdast, comrak                                                      |
| Backend           | Rust, tokio, rusqlite, notify, git2, ropey, rayon, specta                                                                               |
| Search            | SQLite FTS5, Candle BGE-small embeddings, hnsw_rs vector index, Reciprocal Rank Fusion                                                  |
| Graph             | d3-force, Pixi.js/WebGL, worker-based force layout                                                                                      |
| Canvas & Diagrams | Excalidraw, Mermaid                                                                                                                     |
| LSP & Tooling     | lsp-types, custom Rust LSP client, rumdl, IWE, Markdown Oxide, Marksman, language-server discovery for code files                       |
| Plugins & MCP     | Sandboxed iframes, postMessage/RPC bridge, custom `carbide-plugin://` scheme, Axum/Tower HTTP server, JSON-RPC 2.0 MCP stdio/http flows |
| AI                | CLI-based providers for Claude Code, Codex, and Ollama; streaming CLI execution; configurable provider presets                          |
| Git               | git2 backend operations plus source-control UI/actions                                                                                  |
| PDF & Documents   | pdfjs-dist, pdfkit, pdf-extract, lopdf, browser document viewers                                                                        |
| Citations         | Citation.js, BibTeX, CSL, RIS, Zotero Better BibTeX integration                                                                         |
| Terminal          | xterm.js, xterm fit/WebGL addons, tauri-pty                                                                                             |
| Testing & Quality | Vitest, svelte-check, oxlint, custom layering lint, Prettier, stylelint, Rust tests                                                     |

---

## Documentation

- [Getting Started](docs/getting_started.md) — first-run flow, core actions, and quick links
- [Search & Queries](docs/search_and_queries.md) — omnibar, inline `@` palette, query language, search graph, bases, task queries
- [Bases & References](docs/bases_and_references.md) — database views, citations, linked sources, Zotero
- [Markdown Syntax Guide](docs/markdown-syntax-guide.md) — supported syntax and embeds
- [Architecture](docs/architecture.md) — decision tree, layering rules, and project map
- [Plugin How-To](docs/plugin_howto.md) — build plugins, use permissions, call RPC/SDK APIs, and run external MCP sidecars
- [HTML to Markdown Plugin](docs/html_to_markdown_plugin.md) — bundled conversion plugin details
- [Data Storage](docs/data_storage_locations.md) — where Carbide stores settings, caches, indexes, plugins, and vault data
- [UI Design System](docs/UI.md) — semantic tokens, components, and styling rules

---

## Development

```bash
pnpm install
pnpm dev            # Start the Tauri dev server
```

Validation:

```bash
pnpm check          # Svelte/TypeScript type checking
pnpm lint           # oxlint + layering rules
pnpm test           # Vitest unit/integration tests
cd src-tauri && cargo check   # Rust type checking
pnpm format         # Prettier formatting
```

---

## Acknowledgments

Carbide is a fork of [Otterly](https://github.com/ajkdrag/otterly) with inspiration from various tools, including file management architecture from [Ferrite](https://github.com/OlaProeis/Ferrite).
