<img src="./assets/carbide_icon.jpg" alt="Carbide" width="235">

[![Release](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml/badge.svg)](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml)

# Carbide

> **Fork of [Otterly](https://github.com/ajkdrag/otterly)** — Carbide extends Otterly with additional features, plugins, and a redesigned UI.

A local-first Markdown knowledge base built with [Tauri 2](https://tauri.app/), [Svelte 5](https://svelte.dev/), and Rust. Notes are plain Markdown files organized into vaults.

### Why "Carbide"?

Before modern flashlights, coal miners dropped **calcium carbide** into water to produce a bright acetylene flame in their lamps to navigate deep tunnels. The icon depicts a miner's lamp with Markdown symbols (`>` and `*`) forming the flame because Carbide is a local-first Markdown knowledge base with hybrid semantic/FTS search, graph visualization, a composable query language, and an extensible plugin system.

## What it does

- **Local-first, Git-aware**: Vaults are folders of Markdown files on disk. Optional auto-commit on save, version history, and atomic writes.
- **Hybrid search**: Full-text (SQLite FTS5) and semantic embeddings (candle BGE-small) merged via Reciprocal Rank Fusion. Omnibar, search graph, and query language share the same pipeline.
- **Graph and search graph**: Interactive graph view with full-vault and neighborhood modes. Search graph visualizes query results as a network with 1-hop neighbors.
- **Query language and Bases**: Composable query syntax for notes (`named`, `with`, `in`, `linked from`, `with_property`). Bases provides database-style views over vault frontmatter. Task query DSL for filtering/sorting/grouping tasks.
- **AI writing assistance**: Intelligent Writing Engine (IWE) with LSP-based editing features and configurable multi-provider AI. Opt-in.
- **Plugin system**: Iframe-sandboxed plugins with lifecycle management, toolchain manager, and a typed action registry powering shortcuts, menus, and command palette.

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

### Editor

- WYSIWYG Markdown with live rendering and syntax highlighting (Shiki)
- Wikilinks with backlink tracking and autocomplete
- Split-view editing with real-time content sync and draggable tabs
- Collapsible headings, `<details>` sections, and block drag-and-drop
- Math/LaTeX via KaTeX, inline PDF embeds (`![[file.pdf]]`)
- Document outline, editor tuning panel (font, size, line height, zoom)
- Zen mode for distraction-free writing

### Search & Queries

- **Omnibar** (`Cmd+K`): Unified search across notes, commands, settings, and wiki links with cross-vault aggregation
- **Hybrid search**: SQLite FTS5 + semantic embeddings (HNSW) merged via Reciprocal Rank Fusion
- **Query language**: Composable syntax with `named`, `with`, `in`, `linked from`, `with_property` clauses, boolean logic, regex, tags, and subqueries. Saveable as `.query` files
- **Search graph**: Tab-based visualization of query results as a force-directed network with cross-highlighting, edge type toggles, and multi-tab support
- **Bases**: Database-style views of vault frontmatter with filter/sort/pagination in table or list layout. Saved views persist as JSON
- **Task queries**: Filter/sort/group tasks by status, due date, path, section, and text with kanban and schedule views
- **Block-level search**: Semantic similarity at the section level for discovering related content

See [Search & Queries](docs/search_and_queries.md) for full syntax and details.

### Graph & Canvas

- Interactive graph view (d3-force) with full-vault and neighborhood modes
- Semantic similarity edges with configurable thresholds
- WebGL renderer with worker-based force simulation
- Excalidraw canvas for freeform drawing (`.excalidraw` files)
- Mermaid diagram rendering with cached SVG output

### AI & Writing Assistance

- Intelligent Writing Engine (IWE) with LSP-based hover, completion, formatting, rename, inlay hints, and diagnostics
- Configurable multi-provider AI integration with dynamic provider substitution
- AI-generated file tree blurbs displayed inline in the sidebar
- Prompt builder for composing AI queries from vault context

### Task Management

- Markdown-native tasks (`[ ]` / `[-]` / `[x]`) with 3-state cycling and due dates
- Task query engine with filter/sort/pagination, kanban board, and schedule view with drag-to-reschedule
- Task aggregates surfaced as virtual columns in Bases

### References & Citations

- Citation library with BibTeX, CSL, and RIS support via Citation.js
- Zotero Better BibTeX integration with live search
- Linked source folders — register PDF/HTML directories for metadata extraction and full-text search inclusion
- PDF annotation sync from Zotero
- Citation picker that inserts `[@citekey]` and syncs reference metadata to frontmatter

See [Bases & References](docs/bases_and_references.md) for details.

### Git Integration

- Optional auto-commit on save
- File version history and diff views
- Push, pull, and fetch

### Layout & Customization

- 20+ built-in themes with light and dark variants (Nordic, Brutalist, Neon, Paper, Glass, and more)
- 14 layout variants (Spotlight, Cockpit, Theater, Triptych, Dashboard, Zen Deck, and more)
- CSS token editor with inline editing and revert
- Rebindable hotkeys
- Per-vault settings with atomic writes
- Configurable note naming templates with strftime support
- File tree style variants: compact, macOS Finder, refined, airy minimal

### Plugin System

- Extensible plugin architecture with lifecycle management and iframe sandboxing
- Plugin API extensions for search, diagnostics, and workspace events
- Toolchain manager with binary resolver and SHA-256 verification

### More

- Embedded terminal (xterm.js + tauri-pty)
- PDF viewing, export, and inline rendering
- Tag-based organization with hierarchical tag tree
- Markdown linting and unresolved link diagnostics

---

## Tech Stack

| Layer     | Technology                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------- |
| Shell     | [Tauri 2](https://tauri.app/), [tauri-specta](https://github.com/oscartbeaumont/tauri-specta)   |
| Frontend  | Svelte 5, SvelteKit, TypeScript, Tailwind CSS 4, shadcn-svelte                                  |
| Editor    | ProseMirror, CodeMirror 6, Shiki, KaTeX, remark/mdast pipeline                                  |
| Backend   | Rust (tokio), SQLite FTS5, [candle](https://github.com/huggingface/candle) BGE-small embeddings |
| Search    | SQLite FTS5, HNSW vector index, Reciprocal Rank Fusion                                          |
| Graph     | d3-force, WebGL                                                                                 |
| Canvas    | [Excalidraw](https://excalidraw.com/), [Mermaid](https://mermaid.js.org/)                       |
| Git       | `git2` (backend), `isomorphic-git` (frontend)                                                   |
| PDF       | pdfjs-dist, jspdf, pdf-extract (Rust)                                                           |
| Citations | Citation.js (BibTeX, CSL, RIS)                                                                  |
| Terminal  | xterm.js, tauri-pty                                                                             |

---

## Documentation

- [Getting Started](docs/getting_started.md) — first-run flow, core actions, and quick links
- [Search & Queries](docs/search_and_queries.md) — omnibar, query language, search graph, bases, task queries
- [Bases & References](docs/bases_and_references.md) — database views, citations, linked sources, Zotero
- [Markdown Syntax Guide](docs/markdown-syntax-guide.md) — supported syntax and embeds
- [Architecture](docs/architecture.md) — decision tree, layering rules, and project map
- [Plugin How-To](docs/plugin_howto.md) — build and ship plugins
- [Data Storage](docs/data_storage_locations.md) — where Carbide stores settings, caches, and indexes

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
