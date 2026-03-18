<img src="./assets/badger_icon_nobackground2.png" alt="Badgerly" width="150">

[![Release](https://github.com/TranscriptionFactory/badgerly/actions/workflows/release.yml/badge.svg)](https://github.com/TranscriptionFactory/badgerly/actions/workflows/release.yml)

# Badgerly

A fast, local-first Markdown note-taking app built with [Tauri](https://tauri.app/) and [Svelte 5](https://svelte.dev/). Your notes are plain Markdown files in folders you control—no proprietary database, no cloud lock-in. If you ever stop using Badgerly, your notes stay exactly where they are.

## Why Badgerly

Most note-taking apps force a trade-off: polished UX with cloud lock-in, or local-first with heavy Electron bloat and plugin fatigue. Badgerly gives you a native-speed desktop app with a rich editing experience out of the box—no plugin hunting required.

## Features

### Vault Management

- **Vault-based storage** — A vault is just a folder. Use git, sync clients, or VS Code alongside Badgerly without conflicts.
- **Vault switcher** — Dropdown selector with pinned vaults and quick-switch (`Cmd+Shift+V`). Git branch and dirty state indicators per vault.
- **macOS file associations** — Set Badgerly as default for `.md` files. Opening a file routes to the correct vault automatically.

### Editor

- **WYSIWYG Markdown** — Live rendering via Milkdown/ProseMirror. Headings, tables, task lists, and code blocks with syntax highlighting.
- **Wiki-links** — `[[note]]` linking with automatic backlink tracking. Navigate your knowledge base bidirectionally.
- **Split view** — Two-pane editing (`Cmd+\`), independent editor instances, drag tabs to split.
- **Outline panel** — Live heading hierarchy with click-to-scroll navigation and active tracking.
- **Math/LaTeX** — Inline `$expr$` and block `$$expr$$` rendering with KaTeX.
- **Slash commands** — Insert blocks, tables, code, and more with `/` triggers.
- **Typographic substitution** — Auto-convert `-->` to `→`, `<->` to `↔`, and more.
- **Date links** — `@` trigger for quick date-based wiki links (`[[YYYY-MM-DD]]`).

### Document Viewer

- **PDF viewer** — Page navigation, zoom, scroll, and text search via pdfjs.
- **Image viewer** — PNG, JPG, SVG, GIF, WebP with zoom/pan controls.
- **Code viewer** — Syntax-highlighted read-only view for `.py`, `.rs`, `.json`, `.yaml`, and more.
- **PDF export** — Export notes as PDF with `Cmd+Shift+E`.

### Git Integration

- **Local version control** — Auto-commit on save, status bar with branch and dirty state.
- **Remote operations** — Push, pull, fetch with progress indicators. SSH auth uses your existing Git configuration.
- **Version history** — Paginated commit log with note-scoped history.

### Search

- **Omnibar** — One search bar for everything. Full-text search (SQLite FTS5) and quick file navigation (`Cmd+P` / `Cmd+O`).
- **Tags panel** — Browse all tags with counts, click to filter notes.

### Metadata & Bases

- **Visual frontmatter** — Interactive key-value grid for YAML properties. Type-aware editors for booleans, numbers, dates, and strings.
- **Bases** — Query notes by properties and tags with filters, sorts, and multiple view modes.

### Terminal

- **Embedded PTY** — Toggle terminal panel with `Cmd+Shift+\``. Defaults to vault root directory.

### AI Assistant

- **Multi-backend support** — Claude, Codex, and Ollama CLI integration.
- **Diff-first review** — AI suggestions shown as diffs with partial apply.
- **Conversation panel** — Persistent chat history in the context rail.

### Canvas

- **Excalidraw support** — Create and edit `.excalidraw` drawings with theme-aware backgrounds.
- **Canvas naming** — Dialog on create, bi-directional sync with main app.

### Plugin System

- **Sandboxed plugins** — Each plugin runs in an isolated iframe with permission-controlled RPC.
- **Manifest-based** — Declare capabilities in `manifest.json`. Auto-disable on repeated failures.
- **Demo plugins** — Hello World (command palette), Word Count (status bar).

### Theming & Customization

- **Custom hotkeys** — Rebindable shortcuts for every action.
- **Dark & light modes** — System-aware or manual toggle.

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org/) and [pnpm](https://pnpm.io/)
- [Rust toolchain](https://rustup.rs/)
- Platform-specific build tools (see [Tauri's prerequisites](https://tauri.app/start/prerequisites/))

### Installation

```bash
pnpm install
pnpm tauri dev
```

To build a production installer:

```bash
pnpm tauri build
```

## Contributing

Badgerly uses a Ports and Adapters (Hexagonal) architecture with strict layering. See [architecture.md](./docs/architecture.md) for the decision tree and rules.

### Validation

Before submitting a PR, run:

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

Badgerly is a fork of [Otterly](https://github.com/TranscriptionFactory/otterly). Thank you to the Otterly project for providing the foundation this project builds on.

## License

MIT — See [LICENSE](./LICENSE) for details.
