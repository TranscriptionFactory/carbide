<img src="./assets/carbide_icon.jpg" alt="Carbide" width="235">

[![Release](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml/badge.svg)](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml)

# Carbide

> **Fork of [Otterly](https://github.com/ajkdrag/otterly)** — Carbide enhances Otterly with additional features, plugins, and a redesigned UI.

A local-first Markdown knowledge base built with [Tauri 2](https://tauri.app/), [Svelte 5](https://svelte.dev/), and Rust. Notes are stored as plain Markdown files organized into vaults.

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

Built-in auto-updater applies updates on startup.

---

## Tech Stack

| Layer     | Technology                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------- |
| Shell     | [Tauri 2](https://tauri.app/), [tauri-specta](https://github.com/oscartbeaumont/tauri-specta)   |
| Frontend  | Svelte 5, SvelteKit, TypeScript, Tailwind CSS 4, shadcn-svelte                                  |
| Editor    | ProseMirror, CodeMirror 6, Shiki, KaTeX, remark/mdast pipeline                                  |
| Backend   | Rust (tokio), SQLite FTS5, [candle](https://github.com/huggingface/candle) BGE-small embeddings |
| File mgmt | Atomic writes, notify watcher                                                                   |
| Git       | `git2` backend, `isomorphic-git` frontend                                                       |
| Canvas    | [Excalidraw](https://excalidraw.com/), [Mermaid](https://mermaid.js.org/)                       |
| Search    | SQLite FTS5, candle semantic embeddings, fuzzy matching                                         |
| Terminal  | xterm.js, tauri-pty                                                                             |
| Graph     | d3-force                                                                                        |
| PDF       | pdfjs-dist, jspdf, pdf-extract (Rust)                                                           |
| Citations | Citation.js (BibTeX, CSL, RIS)                                                                  |
| Collab    | Yjs, y-prosemirror                                                                              |

---

## Features

### Editor

- WYSIWYG Markdown with live rendering and syntax highlighting (Shiki).
- Wikilinks with backlink tracking and autocomplete.
- Split-view editing with real-time content sync and draggable tabs.
- Collapsible headings and `<details>`/`<summary>` sections with fold toggles.
- Math/LaTeX support via KaTeX.
- Drag-and-drop file embedding, including inline document and PDF embeds (`![[file.pdf]]`).
- Document outline navigation.
- Editor tuning panel: font, size, line height, and zoom controls.
- Zen mode for distraction-free writing (Cmd+Shift+Enter).

### AI & Writing Assistance

- Intelligent Writing Engine (IWE) with LSP-based hover, completion, formatting, rename, inlay hints, and diagnostics.
- Dynamic AI provider substitution for IWE transforms with config-driven actions.
- AI-generated file tree blurbs: note descriptions displayed inline in the sidebar.
- Prompt builder for composing AI queries from vault context.

### Search & Query

- Omnibar for unified file, content, and command searches.
- Full-text search (SQLite FTS5) with instant results.
- Semantic search via candle BGE-small embeddings with hybrid FTS + vector KNN + Reciprocal Rank Fusion.
- Fuzzy matching.
- Composable query language with parser, evaluator, saved `.query` files, and lens views.

### Canvas and Graph

- Excalidraw canvas for freeform drawing (`.excalidraw` files).
- Mermaid diagram rendering in notes with LRU-cached SVG output.
- Interactive graph view of note connections (d3-force) with full-vault and neighborhood modes.
- Semantic similarity edges in graph with configurable thresholds.
- WebGL renderer with worker-based force simulation and viewport culling.

### References & Linked Sources

- Linked source library with embedded sources and search inclusion toggle.
- Auto-load reference library on vault open.
- Zotero Better BibTeX integration.
- BibTeX, CSL, and RIS bibliography support via Citation.js.
- PDF annotation extraction.

### Layout & UI

- 10+ layout variants: Spotlight, Cockpit, Theater, Triptych, Dashboard, and more.
- Activity bar with layout-aware positioning.
- Native macOS menu bar.
- Metadata sidebar panel in context rail.
- Hierarchical tag tree with prefix queries and @-trigger date links.
- File tree style variants: compact, macOS Finder, refined, airy minimal.
- Bases panel for base management.

### Git Integration

- Auto-commit on file save.
- File version history and diff views.
- Push, pull, and fetch support.

### Terminal

- Embedded terminal via xterm.js and tauri-pty.

### PDF

- PDF viewing (pdfjs-dist) and export (jspdf).
- Rust-side PDF text extraction.
- Inline PDF rendering in editor via pdf.js canvas.

### Tags, Diagnostics & Linting

- Tag-based note organization with sidebar panel and Rust backend.
- Unified diagnostics store merging lint and IWE sources.
- AST parse error surfacing with severity mapping.
- Unresolved link diagnostics.
- Configurable Markdown linting.

### Task Management

- Built-in task management (M0–M6 task workflows).
- Indexing and embedding-aware task tracking.

### Plugin System

- Extensible plugin architecture with lifecycle management, settings UI, and iframe sandboxing.
- Plugin API extensions for search, diagnostics, and note-indexed events.
- Auto-tag plugin with TOML-configured allow/deny lists.
- Toolchain manager with binary resolver, installation, and SHA-256 verification.

### Customization

- Themes (light, dark, auto) with custom JSON theme configuration.
- CSS token editor with inline editing and revert.
- Rebindable hotkeys.
- Per-vault settings with atomic writes and crash-safe persistence.
- Configurable note naming templates with strftime support.
- Auto-updater with skip version support.

---

## Acknowledgments

Carbide is a fork of [Otterly](https://github.com/ajkdrag/otterly) with inspiration from various tools, including file management architecture from [Ferrite](https://github.com/OlaProeis/Ferrite).
