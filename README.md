<img src="./assets/carbide_icon.jpg" alt="Carbide" width="235">

[![Release](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml/badge.svg)](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml)

# Carbide

> **Fork of [Otterly](https://github.com/ajkdrag/otterly)** — Carbide extends Otterly with a redesigned UI, deeper search/query workflows, language intelligence, source control, AI, and an extensible plugin/MCP platform.

Carbide is a local-first Markdown workbench for notes, documents, tasks, references, graphs, and plugin-assisted workflows. Vaults are ordinary folders on disk; Carbide adds editing, search, links, Git history, document export, AI tooling, and MCP/plugin integrations around those files.

### Why "Carbide"?

Before modern flashlights, coal miners dropped **calcium carbide** into water to produce a bright acetylene flame in their lamps to navigate deep tunnels. The icon depicts a miner's lamp with Markdown symbols (`>` and `*`) forming the flame because Carbide is built for navigating deep personal knowledge bases with local files, search, graph views, language tools, and extensibility.

## What it does

- **Local-first Markdown vaults**: Vaults are plain folders. Notes, attachments, queries, settings, indexes, and plugins live on disk and remain portable.
- **Editing and documents**: Visual/source Markdown editing, syntax highlighting, wikilinks, transclusion, outlines, PDF/document viewing, and Markdown-to-PDF export.
- **HTML artifacts as first-class citizens**: `.html` files are searchable, embeddable (`![[file.html]]`), and renderable in Source/Safe/Live modes with per-file trust grants — drop LLM-generated artifacts straight into your vault. See [HTML Artifacts](docs/html_artifacts.md).
- **Search, queries, and metadata views**: Hybrid FTS + semantic search with recency-weighted omnibar, inline `@` palette, composable note/task queries, search graph, and Bases views over frontmatter.
- **Graph and relationships**: Full-vault, active-note, and search graphs with backlinks, attachments, semantic edges, and canvas views.
- **Language intelligence**: LSP infrastructure for Markdown (IWE, Markdown Oxide, Marksman, rumdl) and common code languages, with diagnostics, hovers, code actions, and rename/definition.
- **Tasks and planning**: Markdown-native tasks with list/kanban/schedule views, hierarchical heading scoping, relative due dates, and quick-capture.
- **Git-aware workflow**: Init, stage, commit, checkpoint, diff, restore, remotes, push/fetch/pull/sync, optional auto-commit on save.
- **References and linked sources**: BibTeX/CSL/RIS, Zotero Better BibTeX integration, citation picker, bibliography export, linked PDF/HTML source folders with content-addressed extraction cache.
- **AI assistance**: CLI-based providers (Claude Code, Codex, Ollama), inline ask/edit with accept-reject, and vault/editor-aware prompt composition.
- **Extensibility and MCP**: Sandboxed plugins with marketplace, a permissioned SDK/RPC surface, Carbide's own MCP server, and plugin-hosted external MCP sidecars.

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

- ProseMirror/CodeMirror-based visual + source editing with Shiki, KaTeX, callouts, tables, and code blocks
- Wikilinks, heading/block references, backlink tracking, unresolved-link diagnostics, and rename-aware link repair
- Inline embeds for notes, headings, blocks, images, PDFs, **HTML artifacts**, audio/video, files, and Mermaid diagrams
- Edit-in-place for transclusions via a pencil action on the embed toolbar
- Split panes, draggable/pinned tabs, zen/focus modes, line numbers, zoom, and Vim-style navigation
- Document outline, block transforms, drag-and-drop, find/replace, copy as Markdown/HTML
- Daily notes and configurable naming templates

### Document Rendering & Export

- Markdown-to-PDF via a self-contained HTML renderer + native platform PDF capture (macOS, Windows, Linux)
- PDF export inlines images, renders Mermaid diagrams, and rasterizes SVG/KaTeX math
- Mermaid SVG export and Mermaid rendering in slides export
- In-app viewers for PDF, image, code, HTML, and CSV; Excalidraw canvases; external viewer windows
- Linked PDF/HTML source folders keep source material in place with content-addressed extraction cache

### HTML Artifacts

- `.html` files are first-class vault citizens — searchable through FTS (stripped body text + `<title>`), linkable as attachments, and embeddable via `![[file.html]]`
- Three render modes — **Source / Safe / Live** — with per-file or per-folder trust grants persisted under `.carbide/trusted_html.json`
- Default-deny: Live mode requires an explicit grant; Live + Network is a separate opt-in
- **Paste Clipboard HTML as Artifact** writes the file, inserts a transclusion, and records provenance in a `.meta.json` sidecar
- Provenance banner above the renderer; ✕ clears the sidecar
- Sandboxed iframe envelope (`allow-scripts` only, no `allow-same-origin`); theme variables injected so artifacts can blend with the app

See [HTML Artifacts](docs/html_artifacts.md) for render modes, trust grants, transclusion, paste-from-clipboard, and the security model.

### Search, Queries & Navigation

- **Omnibar** (`Cmd/Ctrl+K`): unified entry for notes, commands, settings, links, and cross-vault search, ranked by an `exact_prefix > substring > fuzzy` rule with a 24h recency boost
- **Inline `@` palette**: insert notes, files, headings, dates, tags, citations, and commands from the editor
- **Hybrid search**: SQLite FTS5 + local semantic embeddings merged via Reciprocal Rank Fusion
- **Structured query language**: clause-based note/file/folder queries (`named`, `with`, `in`, `linked from`, `with_property`) with boolean composition, regex, subqueries, and saveable `.query` files
- **Task queries**: status, path, section, text, tag, and due-date filters with boolean operators, relative dates, and hierarchical heading scoping (`section under <heading>`)
- **Fuzzy + hierarchical tag matching**: `#parent` matches `#parent/child`; typos fall back to fuzzy across all tags
- **Search graph** and **Bases** (UI-driven frontmatter views — table/list/kanban/gallery/calendar)

See [Search & Queries](docs/search_and_queries.md).

### Tasks & Planning

- Markdown-native tasks (`[ ]`, `[-]`, `[x]`) with 3-state cycling and inline due dates
- List, kanban, and schedule views; quick capture from app/menu actions
- Embedded task query results with source-note navigation and in-place status toggles
- Hierarchical section scoping, boolean operators, relative dates, sort/group/limit

### Graph, Links & Canvas

- Full-vault, active-note, and search graphs with WebGL/Pixi rendering and worker-based force layout
- Backlinks, outlinks, attachments, smart links, semantic similarity edges, with toggleable edge types
- Fuzzy filtering, cluster detection, focus mode, radial layout
- Graph-to-canvas export, Excalidraw canvases, Mermaid rendering with cached output

### Language Intelligence & Tooling

- LSP results panel for diagnostics, hover, code actions, and workspace edits
- Markdown LSP via IWE, Markdown Oxide, or Marksman; rumdl-backed lint/format/fix
- Code LSP for Python, Rust, TypeScript, JavaScript, Go, JSON, and YAML when the language server is on PATH (lookups memoized)
- Managed toolchain installs Markdown tools on demand
- IWE structural transforms: extract/inline sections, list↔section, link creation

### AI Assistance

- CLI-based provider presets for Claude Code, Codex, and Ollama; auto-resolution by local CLI availability
- Ask/edit modes with inline accept-reject flow
- Prompt builder composes requests from vault and editor context; AI-generated file-tree descriptions

### References, Citations & Linked Sources

- Citation library (CSL-JSON) with BibTeX/CSL/RIS import/export via Citation.js
- Zotero Better BibTeX integration: connection testing, live search, import, annotation sync
- Citation picker inserts `[@citekey]`; bibliography rendering/export
- Linked PDF/HTML source folders with metadata extraction, search inclusion, and a content-addressed extraction cache that survives renames

See [Bases & References](docs/bases_and_references.md).

### Git & Source Control

- Init, status, stage/unstage, commit, commit-all, file diffs
- Named checkpoints, version history with restore, remotes, push/fetch/pull/sync
- Optional auto-commit on save

### Plugins, MCP & Extensibility

- Iframe-sandboxed plugin runtime with marketplace browse/install/update/uninstall and per-plugin settings
- Permission-gated SDK for vault IO, editor, commands, UI contributions, search, metadata, network fetch, AI execution, export, and external sidecars
- Bundled plugins: Auto-Tag, HTML Strip, HTML to Markdown, PDF Export, Slides Export, Smart Templates, Wiki Compiler
- Carbide MCP server with authenticated setup flows for Claude Desktop and Claude Code; tools cover notes, search, tasks, graph, metadata, references, and Git
- External MCP sidecars via the `sidecar.*` SDK

See [Plugin How-To](docs/plugin_howto.md).

### Layout & Customization

- Sidebar views: explorer, dashboard, starred, graph, tasks, tags, source control, daily notes
- 20+ themes (light/dark), CSS token editor, rebindable hotkeys, command-palette actions
- Layout variants, context rail, outline/tasks panels, zen/focus modes, per-vault settings

### More

- Embedded terminal (xterm + WebGL) with multiple sessions and respawn
- File watcher, atomic writes, asset cache, indexed metadata pipeline
- Hierarchical tags panel with prefix selection and tag-based opening
- Per-vault and global storage documented in [Data Storage](docs/data_storage_locations.md)

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
- [HTML Artifacts](docs/html_artifacts.md) — render modes, trust grants, transclusion, paste-as-artifact, security model
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
