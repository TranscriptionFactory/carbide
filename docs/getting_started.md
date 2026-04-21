# Getting Started with Carbide

Carbide is a local-first knowledge studio built around Markdown vaults, semantic search, and programmable actions. Use this guide to get oriented on first launch.

## First launch

- **Welcome guide**: A short welcome sheet opens the first time you run Carbide. Use it to jump directly to vault selection, the command palette, or AI/search settings.
- **Pick a vault**: Choose an existing folder or create a new vault. Carbide keeps settings, caches, embeddings, and references under `.carbide/`.
- **Dashboard snapshot**: After a vault is open, the dashboard summarizes recent notes, tasks, and git status. Open it from the activity bar or `Ctrl/Cmd+Shift+D`.

## Core workflows

- **Command palette** (`Ctrl/Cmd+Shift+P`): Run any action, search commands, and switch contexts from one surface. Use `Ctrl/Cmd+O` to jump directly into note search mode.
- **Create and organize**: New notes and folders flow through the vault-aware action registry; everything is stored as plain Markdown with optional git auto-commit.
- **Semantic search & graph**: Carbide fuses SQLite FTS, embeddings, and graph edges. Enable or tune embeddings under **Settings → Semantic** and explore connections in the graph view.
- **AI inline commands**: Configure providers under **Settings → AI**, then trigger inline transforms from the editor to rewrite, summarize, or generate structured outputs with vault context.
- **Help & shortcuts**: Press **F1** to open the help dialog for keyboard bindings and Markdown syntax. The omnibar also lists actions with their bound keys.

## Where to go next

- **Architecture and decision tree**: See how features are composed and where to place new code in [`docs/architecture.md`](./architecture.md).
- **Plugins and extension points**: Build or install plugins via [`docs/plugin_howto.md`](./plugin_howto.md) and `docs/example-plugins/`.
- **Markdown & documents**: Reference the [`docs/markdown-syntax-guide.md`](./markdown-syntax-guide.md) for supported syntax, embeds, and PDF handling.
- **Bases, references, and data**: Learn how structured queries and citations work in [`docs/bases_and_references.md`](./bases_and_references.md) and where Carbide stores data in [`docs/data_storage_locations.md`](./data_storage_locations.md).
