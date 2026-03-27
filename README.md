
# Carbide

> **Fork of [Otterly](https://github.com/ajkdrag/otterly)** — Carbide enhances Otterly with additional features, plugins, and a redesigned UI.

A fast, local-first Markdown knowledge base built with [Tauri 2](https://tauri.app/), [Svelte 5](https://svelte.dev/), and Rust. Carbide prioritizes speed, extensibility, and your control over your data.

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

Carbide includes a built-in auto-updater, which applies updates automatically on startup.

---

## Tech Stack

| Layer     | Technology                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| Shell     | [Tauri 2](https://tauri.app/), [tauri-specta](https://github.com/oscartbeaumont/tauri-specta)                  |
| Frontend  | Svelte 5, SvelteKit, TypeScript, Tailwind, shadcn-svelte                                                       |
| Editor    | ProseMirror, CodeMirror 6, Shiki, KaTeX                                                                        |
| Backend   | Rust (tokio), SQLite FTS5, [candle](https://github.com/huggingface/candle) BGE-small embeddings                |
| File mgmt | Atomic writes, rope buffers, notify watcher                                                                    |
| Git       | `git2` backend, `isomorphic-git` frontend                                                                      |
| Canvas    | [Excalidraw](https://excalidraw.com/), [Mermaid](https://mermaid.js.org/)                                      |
| Search    | SQLite FTS5, candle semantic embeddings, fuzzy matching                                                       |

---

## Features

### Editor
- WYSIWYG Markdown with live rendering and syntax highlighting.
- Wikilinks with backlink tracking and autocomplete.
- Split-view editing with draggable tabs.
- Math/LaTeX support via KaTeX.
- Drag-and-drop file embedding.

### Search
- Omnibar for unified file, content, and command searches.
- Full-text search with instant results.
- Fuzzy matching and semantic embeddings.

### Git Integration
- Auto-commit on file save.
- File version history and diff views.
- Push, pull, and fetch support.

### Customization
- Themes (light, dark, auto) and custom JSON theme configuration.
- Rebindable hotkeys.
- Per-vault settings for linting, formatting, and plugins.

---

## Acknowledgments

Carbide is a fork of [Otterly](https://github.com/ajkdrag/otterly) with inspiration from various tools, including file management architecture from [Ferrite](https://github.com/OlaProeis/Ferrite)

    