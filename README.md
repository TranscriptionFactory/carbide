<img src="./src-tauri/icons/Square310x310Logo.png" alt="Badgerly" width="235">

[![Release](https://github.com/TranscriptionFactory/badgerly/actions/workflows/release.yml/badge.svg)](https://github.com/TranscriptionFactory/badgerly/actions/workflows/release.yml)

# Badgerly

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

## Tech Stack

| Layer     | Technology                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Shell     | [Tauri 2](https://tauri.app/) + [tauri-specta](https://github.com/oscartbeaumont/tauri-specta)                                         |
| Frontend  | Svelte 5 (runes), SvelteKit, TypeScript, Tailwind, shadcn-svelte                                                                       |
| Editor    | ProseMirror + CodeMirror 6, Shiki, KaTeX                                                                                               |
| Backend   | Rust (tokio), SQLite FTS5, [fastembed](https://github.com/Anush008/fastembed-rs) BGE-small                                             |
| File mgmt | Atomic writes, encoding detection, rope buffers, blake3 hashing, notify watcher (from [Ferrite](https://github.com/jrmoulton/ferrite)) |
| Git       | `git2` backend, `isomorphic-git` frontend                                                                                              |
| Canvas    | [Excalidraw](https://excalidraw.com/), [Mermaid](https://mermaid.js.org/)                                                              |
| Terminal  | xterm.js + tauri-plugin-pty                                                                                                            |
| Search    | SQLite FTS5, fastembed semantic, SkimMatcherV2 fuzzy                                                                                   |
| Viz       | D3-force, Pixi.js                                                                                                                      |

## Features

### Editor

| Feature          | Description                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| WYSIWYG Markdown | Live rendering, headings, tables, task lists, syntax highlighting, slash commands, typographic substitution |
| Wikilinks        | `[[note]]` with autocomplete, backlink tracking, orphan detection, rename repair                            |
| Split view       | Two-pane editing (`Cmd+\`), draggable tabs                                                                  |
| Math/LaTeX       | Inline `$expr$` and block `$$expr$$` via KaTeX                                                              |
| Outline panel    | Live heading hierarchy with click-to-scroll                                                                 |
| Date links       | `@` trigger for `[[YYYY-MM-DD]]` links                                                                      |

### Graph & Semantic Search

| Feature             | Description                                    |
| ------------------- | ---------------------------------------------- |
| Knowledge graph     | D3-force visualization of note connections     |
| Semantic embeddings | BGE-small-en vectors per note via fastembed    |
| Similarity scoring  | KNN-based with configurable thresholds         |
| Suggested links     | Wikilink recommendations by semantic proximity |

### Search & Discovery

| Feature          | Description                                   |
| ---------------- | --------------------------------------------- |
| Omnibar          | Unified file/content/command search (`Cmd+P`) |
| Full-text search | SQLite FTS5 with instant results              |
| Fuzzy matching   | SkimMatcherV2 (fzf-style)                     |
| Tags panel       | Browse tags with counts and filtering         |

### Document Viewer

| Feature      | Description                                                 |
| ------------ | ----------------------------------------------------------- |
| PDF viewer   | Page nav, zoom, scroll, text search                         |
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
| Frontmatter editor | Interactive YAML property editor                      |
| Bases              | Query notes by properties/tags with filters and sorts |

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
| Extension points    | Commands, status bar, sidebar panels, settings, ribbon icons, events  |
| Namespaces          | `vault`, `editor`, `commands`, `ui`, `metadata`, `events`, `settings` |
| Credential proxy    | Secure API keys without exposing to plugins                           |

See [Plugin How-To](./docs/plugin_howto.md) for the full API.

### Customization

| Feature        | Description                                         |
| -------------- | --------------------------------------------------- |
| Themes         | Dark/light modes, custom JSON themes                |
| Hotkeys        | Rebindable shortcuts                                |
| Vault settings | Per-vault config for git, lint, formatting, plugins |

## Getting Started

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

Badgerly uses a Ports and Adapters (Hexagonal) architecture. See [architecture.md](./docs/architecture.md) for the decision tree and rules.

| Command                       | Check                           |
| ----------------------------- | ------------------------------- |
| `pnpm check`                  | Svelte/TypeScript type checking |
| `pnpm lint`                   | oxlint + layering rules         |
| `pnpm test`                   | Vitest unit tests               |
| `cd src-tauri && cargo check` | Rust type checking              |
| `pnpm format`                 | Prettier formatting             |

## Star History

<!-- [![Star History Chart](https://api.star-history.com/svg?repos=TranscriptionFactory/badgerly&type=date&legend=top-left)](https://www.star-history.com/#TranscriptionFactory/badgerly&type=date&legend=top-left) -->

## Acknowledgments

Fork of [Otterly](https://github.com/TranscriptionFactory/otterly). File management architecture from [Ferrite](https://github.com/jrmoulton/ferrite).

## License

MIT — See [LICENSE](./LICENSE).
