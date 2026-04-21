<img src="./assets/carbide_icon.jpg" alt="Carbide" width="235">

[![Release](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml/badge.svg)](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml)

# Carbide

> **Fork of [Otterly](https://github.com/ajkdrag/otterly)** — Carbide enhances Otterly with additional features, plugins, and a redesigned UI.

A local-first Markdown knowledge base built with [Tauri 2](https://tauri.app/), [Svelte 5](https://svelte.dev/), and Rust. Notes are stored as plain Markdown files organized into vaults.

## Why Carbide

- **Local-first, Git-aware**: Vaults stay on disk with optional auto-commit and conflict-safe atomic writes. Everything flows through a single action registry so shortcuts, menus, and UI all share the same behavior.
- **Hybrid search + graph**: SQLite FTS, semantic embeddings (candle), and graph edges combine for fast recall with meaningful context. Omnibar, graph view, and search graph share the same pipeline.
- **AI that fits your workflow**: Inline commands, Intelligent Writing Engine (IWE) LSP features, and configurable providers with vault-context prompts — all opt-in and observable.
- **Programmable surface**: Plugin sandbox, toolchain manager, and command palette exposed through typed actions. Hooks for search, diagnostics, slash commands, and workspace events.
- **Onboarding that respects expertise**: First-run welcome guide, vault dashboard, and help dialog surface the critical paths without hiding advanced controls.

## Documentation

- [Getting started](docs/getting_started.md) — first-run flow, core actions, and quick links.
- [Architecture](docs/architecture.md) — decision tree and layering rules.
- [Plugin how-to](docs/plugin_howto.md) — build and ship plugins.
- [Markdown syntax guide](docs/markdown-syntax-guide.md) — supported syntax and embeds.

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


### macOS GateKeeper 

Mac users will see **"Carbide is damaged and cannot be opened"** because carbide isn't signed with an Apple App-store registered developer key ($100/year). Run this command in Terminal:

```bash
xattr -cr /Applications/carbide.app
```

This removes the quarantine attribute that macOS adds to unsigned apps. After running this command, you can open Carbide normally. Alternatively, open settings, go to privacy & security and click 'open' in the 'Security' section. Thanks, [github/zouwei](https://github.com/zouwei) for the idea to put this here. 

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
| Search    | SQLite FTS5, candle semantic embeddings, HNSW vector index, fuzzy matching                      |
| Terminal  | xterm.js, tauri-pty                                                                             |
| Graph     | d3-force                                                                                        |
| PDF       | pdfjs-dist, jspdf, pdf-extract (Rust)                                                           |
| Citations | Citation.js (BibTeX, CSL, RIS)                                                                  |

---

## Features

### Workflow & Orchestration

- Single action registry powers UI, menus, shortcuts, and Tauri menus for deterministic behavior across surfaces.
- Omnibar and command palette unify note search, commands, and cross-vault actions with semantic rankings.
- Vault dashboard summarizes recents, tasks, and git status; first-run welcome guide highlights core paths.
- Git-aware workflows: optional auto-commit on save, tab-close guards, and restore/version history dialogs.

### Editor

- WYSIWYG Markdown with live rendering and syntax highlighting (Shiki).
- Wikilinks with backlink tracking and autocomplete.
- Split-view editing with real-time content sync and draggable tabs.
- Collapsible headings and `<details>`/`<summary>` sections with fold toggles.
- Math/LaTeX support via KaTeX.
- Drag-and-drop file embedding, including inline document and PDF embeds (`![[file.pdf]]`).
- Document outline navigation.
- Editor tuning panel: font, size, line height, and zoom controls.
- Block drag-and-drop with section-aware handles for reordering content.
- Zen mode for distraction-free writing (Cmd+Shift+Enter).

### AI & LSP Writing Assistance

- Configurable/multi-provider LSP integration
- Intelligent Writing Engine (IWE) with LSP-based hover, completion, formatting, rename, inlay hints, and diagnostics.
- Dynamic AI provider substitution for IWE transforms with config-driven actions.
- AI-generated file tree blurbs: note descriptions displayed inline in the sidebar.
- Prompt builder for composing AI queries from vault context.

### Search & Query

- Omnibar for unified file, content, and command searches.
- Full-text search (SQLite FTS5) with instant results.
- Semantic search via candle BGE-small embeddings with hybrid FTS + HNSW vector index + Reciprocal Rank Fusion.
- Block-level semantic embeddings with `find_similar_blocks` for discovering related content across notes.
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

- Markdown-native tasks (`[ ]`/`[-]`/`[x]`) with 3-state cycling, due dates, and editor-first mutations.
- Rich query engine with filter/sort/pagination, kanban board with custom property grouping, and schedule drag-to-reschedule.
- Task aggregates surfaced as virtual columns in bases for unified querying.

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
