<img src="./src-tauri/icons/Square310x310Logo.png" alt="Badgerly" width="235">

[![Release](https://github.com/TranscriptionFactory/badgerly/actions/workflows/release.yml/badge.svg)](https://github.com/TranscriptionFactory/badgerly/actions/workflows/release.yml)

# Badgerly

A fast, local-first Markdown knowledge base built with [Tauri 2](https://tauri.app/), [Svelte 5](https://svelte.dev/), and Rust. Your notes are plain Markdown files in folders you control—no proprietary formats, no cloud dependency, no vendor lock-in.

## Philosophy

**Your data, your storage.** Notes live as standard Markdown files on disk. Badgerly never locks content behind a proprietary format or opaque database. You can edit the same files in any text editor, sync them with any tool, and leave Badgerly without losing anything.

**Local-first, always.** Everything runs on your machine. Full-text search, semantic embeddings, wikilink resolution, graph visualization—all computed locally. No account required, no telemetry, no network dependency.

**Native speed, not Electron weight.** Tauri's Rust backend and the system webview deliver a desktop app that starts fast and stays responsive. No bundled Chromium, no hundred-megabyte runtime, no sluggish editing on large files.

**Rich editing, out of the box.** WYSIWYG Markdown with live preview, wikilinks with backlink tracking, embedded PDFs and images, KaTeX math, Mermaid diagrams, Excalidraw canvas, split-pane editing, integrated terminal, Git version control, and semantic similarity search—all included, no plugin fatigue.

**Extensible, securely.** A sandboxed plugin system runs extensions in isolated iframes with permission-gated RPC. Plugins can contribute commands, status bar items, sidebar panels, and respond to vault events—but cannot access your data without explicit consent.

**Built for tinkerers.** Integrated terminal, Git operations with push/pull/fetch, per-vault configuration, vault-level markdown linting with rumdl, and an AI assistant that proposes diffs rather than rewriting your notes wholesale. The tooling you expect, integrated into your writing environment.

## Tech Stack

| Layer               | Technology                                                                                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shell**           | [Tauri 2](https://tauri.app/) with [tauri-specta](https://github.com/oscartbeaumont/tauri-specta) for end-to-end type-safe IPC                                                                                                      |
| **Frontend**        | Svelte 5 (runes), SvelteKit, TypeScript, Tailwind CSS, shadcn-svelte                                                                                                                                                                |
| **Editor**          | ProseMirror core with CodeMirror 6 code blocks, Shiki syntax highlighting, KaTeX math                                                                                                                                               |
| **Backend**         | Rust (tokio async runtime), SQLite with FTS5, [fastembed](https://github.com/Anush008/fastembed-rs) (BGE-small) for vector embeddings                                                                                               |
| **File management** | Atomic writes, `chardetng`/`encoding_rs` encoding detection, `ropey` rope buffers for large files, `blake3` content hashing, `notify` filesystem watcher — architecture ported from [Ferrite](https://github.com/jrmoulton/ferrite) |
| **Git**             | `git2` (libgit2) on the backend, `isomorphic-git` on the frontend                                                                                                                                                                   |
| **Canvas**          | [Excalidraw](https://excalidraw.com/) integration, [Mermaid](https://mermaid.js.org/) diagram rendering                                                                                                                             |
| **Terminal**        | xterm.js + tauri-plugin-pty                                                                                                                                                                                                         |
| **Search**          | SQLite FTS5 full-text, fastembed semantic, SkimMatcherV2 fuzzy matching                                                                                                                                                             |
| **Visualization**   | D3-force graph layout, Pixi.js canvas rendering                                                                                                                                                                                     |

## Features

### Editor

- **WYSIWYG Markdown** — Live rendering via ProseMirror. Headings, tables, task lists, code blocks with syntax highlighting (Shiki), slash commands, and typographic substitution (`-->` → `→`)
- **Wikilinks** — `[[note]]` linking with autocomplete, automatic backlink tracking, orphan detection, and link repair on rename
- **Split view** — Two-pane editing (`Cmd+\`) with independent editors and draggable tabs
- **Math/LaTeX** — Inline `$expr$` and block `$$expr$$` rendering via KaTeX
- **Outline panel** — Live heading hierarchy with click-to-scroll and active tracking
- **Date links** — `@` trigger for date-based wiki links (`[[YYYY-MM-DD]]`)

### Graph & Semantic Search

- **Knowledge graph** — Interactive D3-force visualization of note connections
- **Semantic embeddings** — BGE-small-en (via fastembed) computes vector embeddings per note
- **Similarity scoring** — KNN-based similarity with configurable thresholds surfaces related notes
- **Suggested links** — Recommends new wikilink connections based on semantic proximity
- Additional graph features (clustering, community detection) planned

### Search & Discovery

- **Omnibar** — Unified search for files, content, and commands (`Cmd+P` / `Cmd+O`)
- **Full-text search** — SQLite FTS5 index with instant results
- **Fuzzy matching** — SkimMatcherV2 (skim/fzf-style) for file and command lookup
- **Tags panel** — Browse all tags with counts, click to filter

### Document Viewer

- **PDF viewer** — Page navigation, zoom, scroll, text search (pdfjs-dist)
- **Image viewer** — PNG, JPG, SVG, GIF, WebP with zoom/pan
- **Code viewer** — Syntax-highlighted read-only view for `.py`, `.rs`, `.json`, `.yaml`, and more
- **PDF export** — Export notes as styled PDF (`Cmd+Shift+E`)

### Markdown Linting & Formatting

- **LSP-based linting** — Custom lint rules with per-vault configuration
- **Auto-formatting** — Configurable formatters, vault-wide or per-file
- **Lint status** — Real-time diagnostics in the editor

### Tasks & Tags

- **Task extraction** — Parses `- [ ]` items across your vault
- **Multiple views** — Kanban board, schedule (date-based), and list views
- **Quick capture** — Dialog for creating tasks without leaving your current note
- **Tag management** — Frontmatter and inline tag extraction with counts and filtering

### Git Integration

- **Auto-commit** — Configurable commit-on-save strategy
- **Status bar** — Branch name, dirty state, push/pull indicators
- **Remote operations** — Push, pull, fetch with progress. SSH auth uses your existing Git config
- **Version history** — Paginated commit log, note-scoped history, diff viewing, commit restoration

### Terminal

- **Embedded PTY** — Full terminal via xterm.js (`Cmd+Shift+\``). Defaults to vault root

### Canvas & Diagrams

- **Excalidraw** — Create and edit `.excalidraw` drawings with theme-aware backgrounds
- **Mermaid** — Render flowcharts, sequence diagrams, Gantt charts, and more inline in notes

### AI Assistant

- **Multi-backend** — Claude, Codex, Ollama — configure via CLI or API
- **Diff-first review** — AI suggestions rendered as diffs with partial apply
- **Conversation panel** — Persistent chat history in the context rail
- **Selection-aware** — Highlight text to scope AI suggestions

### Plugin System

- **Sandboxed execution** — Each plugin runs in an isolated iframe with permission-controlled RPC
- **Manifest-based** — Declare capabilities in `manifest.json`; auto-disables on repeated failures
- **Extension points** — Commands, status bar items, sidebar panels, settings tabs, ribbon icons, event subscriptions
- **RPC namespaces** — `vault`, `editor`, `commands`, `ui`, `metadata`, `events`, `settings`
- **Credential proxying** — Secure API key handling without exposing secrets to plugin code
- See the [Plugin How-To](./docs/plugin_howto.md) for the full API reference and getting started guide

### Metadata & Bases

- **Visual frontmatter** — Interactive YAML property editor with type-aware inputs
- **Bases** — Query notes by properties and tags with filters, sorts, and multiple view modes

### Customization

- **Themes** — Dark and light modes with system-aware toggle; custom theme editing via JSON
- **Hotkeys** — Rebindable shortcuts for every action
- **Vault-scoped settings** — Per-vault configuration for git, lint, formatting, and plugins

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org/) and [pnpm](https://pnpm.io/)
- [Rust toolchain](https://rustup.rs/)
- Platform-specific build tools (see [Tauri prerequisites](https://tauri.app/start/prerequisites/))

### Installation

```bash
pnpm install
pnpm tauri dev
```

Production build:

```bash
pnpm tauri build
```

## Contributing

Badgerly uses a Ports and Adapters (Hexagonal) architecture with strict layering. See [architecture.md](./docs/architecture.md) for the decision tree and rules.

### Validation

```bash
pnpm check      # Svelte/TypeScript type checking
pnpm lint        # oxlint + layering rules
pnpm test        # Vitest unit tests
cd src-tauri && cargo check  # Rust type checking
pnpm format     # Prettier
```

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=TranscriptionFactory/badgerly&type=date&legend=top-left)](https://www.star-history.com/#TranscriptionFactory/badgerly&type=date&legend=top-left)

## Acknowledgments

Badgerly is a fork of [Otterly](https://github.com/TranscriptionFactory/otterly). File management architecture draws from [Ferrite](https://github.com/jrmoulton/ferrite).

## License

MIT — See [LICENSE](./LICENSE) for details.
