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
- Split-view editing with draggable tabs.
- Math/LaTeX support via KaTeX.
- Drag-and-drop file embedding.
- Document outline navigation.

### Search

- Omnibar for unified file, content, and command searches.
- Full-text search (SQLite FTS5) with instant results.
- Semantic search via candle BGE-small embeddings.
- Fuzzy matching.

### Canvas and Graph

- Excalidraw canvas for freeform drawing (`.excalidraw` files).
- Mermaid diagram rendering in notes.
- Interactive graph view of note connections (d3-force).

### Git Integration

- Auto-commit on file save.
- File version history and diff views.
- Push, pull, and fetch support.

### Terminal

- Embedded terminal via xterm.js and tauri-pty.

### PDF

- PDF viewing (pdfjs-dist) and export (jspdf).
- Rust-side PDF text extraction.

### Citations

- BibTeX, CSL, and RIS bibliography support via Citation.js.
- Zotero Better BibTeX integration.

### Tags and Linting

- Tag-based note organization.
- Configurable Markdown linting.

### Plugin System

- Extensible plugin architecture for adding custom functionality.

### Customization

- Themes (light, dark, auto) and custom JSON theme configuration.
- Rebindable hotkeys.
- Per-vault settings.

---

## Acknowledgments

Carbide is a fork of [Otterly](https://github.com/ajkdrag/otterly) with inspiration from various tools, including file management architecture from [Ferrite](https://github.com/OlaProeis/Ferrite).
