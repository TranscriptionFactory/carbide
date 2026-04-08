---
"carbide": minor
---

### Generic source editing, CLI enhancements, and reliability fixes

- **Generic source editing**: Non-markdown files (YAML, TOML, JSON, etc.) can now be edited through the LSP workspace edit pipeline, using a text-by-default architecture.
- **CLI `reindex` command**: New `carbide reindex` subcommand triggers vault re-indexing via both CLI and MCP.
- **CLI `edit` command**: Edit vault files directly from the command line.
- **CLI `cat` command**: Read/display file contents with glow-rendered markdown output.
- **CLI `search --paths-only`**: Search results can now return file paths only for scripting use.
- **CLI `tags --filter`**: Filter tags listing by pattern.
- **CLI exit codes**: Proper exit codes for all CLI commands, enabling reliable scripting.
- **Dynamic shell completions**: Tab completions generated from live vault state.
- **Glow rendering**: `read` and `open` commands now render markdown through glow for rich terminal output.
- **Undoable workspace edits**: IWE workspace edits are now undoable in both the code and visual editors.
- **Tag normalization**: Frontmatter tags with `#` prefix are now normalized consistently.
- **URI handling**: Fixed double-prefixed `file://` URIs from the IWE LSP server.
- **MCP protocol**: Added camelCase serde rename to MCP protocol structs for spec compliance.
- **CodeAction fix**: Skip `codeAction/resolve` when the action already carries an edit field.
- **Sidecar downloads**: Added curl timeouts/retries; removed broken `--version` call from download scripts.
- **Security**: Triaged dependabot alerts — upgraded deps and removed unused `serde_yml`.
