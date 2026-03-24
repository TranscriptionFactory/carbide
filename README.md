<img src="./assets/carbide_icon.jpg" alt="Carbide" width="235">

[![Release](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml/badge.svg)](https://github.com/TranscriptionFactory/carbide/actions/workflows/release.yml)

# Carbide

> **Fork of [Otterly](https://github.com/ajkdrag/otterly)** — Carbide builds on Otterly's foundation with additional features, plugins, and a redesigned UI.

A fast, local-first Markdown knowledge base built with [Tauri 2](https://tauri.app/), [Svelte 5](https://svelte.dev/), and Rust. Notes are plain Markdown files—no proprietary formats, no cloud dependency, no vendor lock-in.

## Philosophy

| Principle         | What it means                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Your data**     | Standard Markdown files in folders you control. Edit anywhere, sync with any tool, leave without losing anything.                            |
| **Local-first**   | Full-text search, embeddings, wikilinks, graph visualization—all computed locally. No account, no telemetry, no network required.            |
| **Native speed**  | Rust backend + system webview. No bundled Chromium, no sluggish editing on large files.                                                      |
| **Rich editing**  | WYSIWYG Markdown, wikilinks, backlinks, embedded files, KaTeX, Mermaid, Excalidraw, split panes, terminal, Git—all built-in.                 |
| **Extensible**    | Plugin system with sandboxed iframes and permission-gated RPC. Plugins contribute commands, panels, and UI—without unrestricted data access. |
| **For tinkerers** | Integrated terminal, Git operations, per-vault config, linting, AI assistant that proposes diffs—not wholesale rewrites.                     |

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

Carbide includes a built-in auto-updater—once installed, updates are applied automatically on startup with an option to skip specific versions.

## Tech Stack

| Layer     | Technology                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Shell     | [Tauri 2](https://tauri.app/) + [tauri-specta](https://github.com/oscartbeaumont/tauri-specta) (type-safe IPC)                         |
| Frontend  | Svelte 5 (runes), SvelteKit, TypeScript, Tailwind, shadcn-svelte                                                                       |
| Editor    | ProseMirror + CodeMirror 6, Shiki, KaTeX                                                                                               |
| Backend   | Rust (tokio), SQLite FTS5, [candle](https://github.com/huggingface/candle) BGE-small embeddings                                        |
| File mgmt | Atomic writes, encoding detection, rope buffers, blake3 hashing, notify watcher (from [Ferrite](https://github.com/jrmoulton/ferrite)) |
| Git       | `git2` backend, `isomorphic-git` frontend                                                                                              |
| Canvas    | [Excalidraw](https://excalidraw.com/), [Mermaid](https://mermaid.js.org/)                                                              |
| Terminal  | xterm.js + tauri-plugin-pty                                                                                                            |
| Search    | SQLite FTS5, candle semantic, SkimMatcherV2 fuzzy                                                                                      |
| Viz       | D3-force, WebGL                                                                                                                        |
| Linting   | [rumdl](https://github.com/platers/rumdl) LSP sidecar                                                                                  |

## Features

### Editor

| Feature               | Description                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| WYSIWYG Markdown      | Live rendering, headings, tables, task lists, syntax highlighting, slash commands, typographic substitution |
| Wikilinks             | `[[note]]` with autocomplete, backlink tracking, orphan detection, rename repair                            |
| Split view            | Two-pane editing (`Cmd+\`) with real-time content sync, draggable tabs                                      |
| Collapsible headings  | Clickable fold toggles in both visual and source modes                                                      |
| Resizable code blocks | Drag handle to resize, height persisted per block                                                           |
| Find & replace        | `Cmd+H` with replace-all in a single transaction                                                            |
| Inline embeds         | Inline SVG preview for Excalidraw, `![[file.pdf]]` for PDF embedding                                        |
| Math/LaTeX            | Inline `$expr$` and block `$$expr$$` via KaTeX                                                              |
| Outline panel         | Live heading hierarchy with click-to-scroll                                                                 |
| Date links            | `@` trigger for `[[YYYY-MM-DD]]` links                                                                      |
| Zen mode              | Distraction-free writing (`Cmd+Shift+Enter`)                                                                |
| Drag-and-drop         | Drop external files into the editor with automatic embedding                                                |

### IWE (Intelligent Writing Engine)

| Feature            | Description                                                  |
| ------------------ | ------------------------------------------------------------ |
| LSP integration    | Hover, go-to-definition, completion, formatting, rename      |
| Inline diagnostics | Real-time diagnostics surfaced in Problems panel             |
| Inlay hints        | Contextual hints rendered inline in the editor               |
| Dynamic triggers   | Completion triggers read from server capabilities at startup |

### Graph & Semantic Search

| Feature             | Description                                                       |
| ------------------- | ----------------------------------------------------------------- |
| Knowledge graph     | WebGL-rendered force-directed visualization with viewport culling |
| Graph views         | Toggle between vault-wide and neighborhood-scoped views           |
| Graph tabs          | Open graph as a first-class tab alongside notes                   |
| Semantic embeddings | BGE-small-en vectors per note via pure-Rust candle                |
| Hybrid search       | FTS + vector KNN + Reciprocal Rank Fusion re-ranking              |
| Suggested links     | Wikilink recommendations by semantic proximity                    |

### Search & Discovery

| Feature           | Description                                              |
| ----------------- | -------------------------------------------------------- |
| Omnibar           | Unified file/content/command search (`Cmd+P`)            |
| Full-text search  | SQLite FTS5 with instant results                         |
| Fuzzy matching    | SkimMatcherV2 (fzf-style) across files, commands, links  |
| Hierarchical tags | Tree-based tag browser with prefix queries and filtering |

### Document Viewer

| Feature      | Description                                                 |
| ------------ | ----------------------------------------------------------- |
| PDF viewer   | Continuous scroll and paginated modes, text selection       |
| Image viewer | PNG, JPG, SVG, GIF, WebP with zoom/pan                      |
| Code viewer  | Syntax-highlighted for `.py`, `.rs`, `.json`, `.yaml`, etc. |
| PDF export   | Styled PDF output (`Cmd+Shift+E`)                           |

### Tasks, Tags & Metadata

| Feature            | Description                                           |
| ------------------ | ----------------------------------------------------- |
| Task extraction    | Parse `- [ ]` items across vault                      |
| Task views         | Kanban, schedule, list                                |
| Quick capture      | Create tasks without leaving current note             |
| Tag management     | Frontmatter and inline tag extraction                 |
| Metadata panel     | Sidebar panel with read-only note properties          |
| Frontmatter editor | Interactive YAML property editor with slash command   |
| Bases              | Query notes by properties/tags with filters and sorts |

### Linting & Formatting

| Feature          | Description                                                     |
| ---------------- | --------------------------------------------------------------- |
| Markdown linting | Real-time diagnostics via rumdl LSP sidecar with gutter markers |
| Problems panel   | VS Code-style tabbed panel (terminal + problems)                |
| Format-on-save   | Configurable formatter (rumdl or Prettier)                      |
| Format now       | On-demand formatting (`Cmd+Shift+F`)                            |
| Fix-all action   | Apply all lint fixes in one action                              |

### Git Integration

| Feature         | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| Auto-commit     | Configurable commit-on-save                                  |
| Status bar      | Branch, dirty state, push/pull indicators                    |
| Remote ops      | Push, pull, fetch with progress; SSH via existing Git config |
| Version history | Commit log, note-scoped history, diff view, restore          |

### Canvas & Diagrams

| Feature    | Description                                                  |
| ---------- | ------------------------------------------------------------ |
| Excalidraw | Create/edit `.excalidraw` files with theme-aware backgrounds |
| Mermaid    | Flowcharts, sequence diagrams, Gantt charts inline           |

### AI Assistant

| Feature            | Description                             |
| ------------------ | --------------------------------------- |
| Multi-backend      | Claude, Codex, Ollama via CLI or API    |
| Diff-first review  | Suggestions as diffs with partial apply |
| Conversation panel | Persistent chat history                 |
| Selection-aware    | Highlight text to scope suggestions     |

### Plugin System

| Feature             | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| Sandboxed execution | Isolated iframe with permission-controlled RPC                        |
| Manifest-based      | Declare capabilities in `manifest.json`                               |
| Runtime settings    | Plugin-declared settings with persistence and UI                      |
| Extension points    | Commands, status bar, sidebar panels, settings, ribbon icons, events  |
| Namespaces          | `vault`, `editor`, `commands`, `ui`, `metadata`, `events`, `settings` |
| Credential proxy    | Secure API keys without exposing to plugins                           |

See [Plugin How-To](./docs/plugin_howto.md) for the full API.

### Workspace

| Feature           | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| Vault switcher    | Dropdown selector (`Cmd+Shift+V`) with recent vaults and git status |
| Terminal          | Integrated terminal (`Cmd+Shift+\``) with PTY, persists across tabs |
| Native menu bar   | macOS menu bar with app-specific items (File, Edit, View, etc.)     |
| File associations | Registers as handler for `.md`, `.markdown`, `.mdx` files on macOS  |
| Auto-update       | Background update check on startup with skip-version support        |

### Customization

| Feature          | Description                                                       |
| ---------------- | ----------------------------------------------------------------- |
| Themes           | Dark/light/auto, built-in themes (Floating, Glass, Dense, Linear) |
| Custom themes    | JSON theme definitions with live preview                          |
| File tree styles | Compact, macOS Finder, Refined, Airy Minimal variants             |
| Hotkeys          | Rebindable shortcuts                                              |
| Vault settings   | Per-vault config for git, lint, formatting, plugins               |
| Note naming      | Configurable default note names with strftime templates           |

## Building from Source

### Prerequisites

| Requirement    | Link                                                          |
| -------------- | ------------------------------------------------------------- |
| Node.js 20+    | [nodejs.org](https://nodejs.org/)                             |
| pnpm           | [pnpm.io](https://pnpm.io/)                                   |
| Rust toolchain | [rustup.rs](https://rustup.rs/)                               |
| Platform tools | [Tauri prerequisites](https://tauri.app/start/prerequisites/) |

### Commands

| Command            | Purpose                  |
| ------------------ | ------------------------ |
| `pnpm install`     | Install dependencies     |
| `pnpm tauri dev`   | Start development server |
| `pnpm tauri build` | Production build         |

## Contributing

Carbide uses a Ports and Adapters (Hexagonal) architecture. See [architecture.md](./docs/architecture.md) for the decision tree and rules.

| Command                       | Check                           |
| ----------------------------- | ------------------------------- |
| `pnpm check`                  | Svelte/TypeScript type checking |
| `pnpm lint`                   | oxlint + layering rules         |
| `pnpm test`                   | Vitest unit tests               |
| `cd src-tauri && cargo check` | Rust type checking              |
| `pnpm format`                 | Prettier formatting             |

## Acknowledgments

Fork of [Otterly](https://github.com/ajkdrag/otterly). File management architecture from [Ferrite](https://github.com/jrmoulton/ferrite).

## License

MIT — See [LICENSE](./LICENSE).
