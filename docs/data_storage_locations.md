# Carbide Data Storage Locations (macOS)

## Global (`~/.carbide/`)

| File/Dir                      | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `vaults.json`                 | Vault registry (paths, metadata)                     |
| `carbide/settings.json`       | Global app settings (via Tauri's `app_config_dir()`) |
| `mcp-token`                   | MCP auth token (0o600 perms)                         |
| `caches/vaults/{VAULT_ID}.db` | SQLite — FTS index, tags, tasks, vector embeddings   |
| `local_state/{VAULT_ID}.json` | Per-vault local state (not synced)                   |

## Per-Vault (`<VAULT>/.carbide/`)

| File/Dir                  | Purpose                           |
| ------------------------- | --------------------------------- |
| `settings.json`           | Vault-specific settings           |
| `smart-links/rules.json`  | Smart link rules                  |
| `references/library.json` | Bibliography metadata             |
| `references/annotations/` | Reference annotations             |
| `plugin_settings.json`    | Plugin config & permissions       |
| `plugins/`                | Installed plugins & assets        |
| `.mcp.json`               | MCP server config for Claude Code |

## Per-Vault (root level)

- `.iwe/config.toml` — markdown-oxide LSP config
- `.moxide.toml`, `.marksman.toml`, `.rumdl.toml` — other LSP/linter configs

## Tauri-managed (`~/Library/Application Support/com.carbide.desktop/`)

- **Window state** — size, position, maximized (via `tauri-plugin-window-state`)
- **Logs** — in `logs/` subdirectory (via `tauri-plugin-log`)

## Cache (`~/Library/Caches/com.carbide.desktop/`)

- `models/` — downloaded Hugging Face embedding models

## External Integrations

- `~/Library/Application Support/Claude/claude_desktop_config.json` — MCP server entry for Claude Desktop
- `~/.local/bin/carbide` — CLI symlink

## Browser LocalStorage

- Theme cache, last update check timestamp, skipped version, recent commands/notes, tab state, starred paths

## Temporary (auto-cleaned)

- System temp dir (`/tmp`) — lint/format operations, PDF extraction, atomic rename intermediaries

## In-Memory Only (lost on restart)

- Asset caches: vault (128 MB), plugins (64 MB), excalidraw (32 MB) — LRU eviction
- HNSW vector index (reconstructed from SQLite on load)

## Cross-platform notes

Paths mirror Tauri's conventions:

- **Windows**: `%AppData%\\Roaming\\com.carbide.desktop\\` for config and `AppData\\Local\\com.carbide.desktop\\` for caches.
- **Linux**: `~/.config/com.carbide.desktop/` for config and `~/.cache/com.carbide.desktop/` for caches.
- Per-vault layout under `<VAULT>/.carbide/` is identical across platforms.
