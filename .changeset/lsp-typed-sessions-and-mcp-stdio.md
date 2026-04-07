---
"carbide": minor
---

### LSP typed session model and reliability improvements

- **Typed LSP status**: `MarkdownLspStatus` enum in Rust and TypeScript replaces fragile string-based status tracking. Statuses: Starting, Running, Restarting, Stopped, Failed.
- **Provider resolution**: Extracted `provider.rs` module for markdown LSP provider resolution (IWES/Marksman) with capability metadata.
- **Lint lifecycle fix (BUG-010)**: `lint_close_file` returns Ok when no session exists instead of erroring.
- **Transport diagnostics (BUG-009)**: Stderr ring buffer, init timeout (30s default, 10s for cloud-backed vaults), typed init errors (`InitTimeout`, `InitEof`, `InitFailed`), retryable/non-retryable classification.
- **IWES packaging (BUG-005)**: Populated `platform_binaries` for auto-download from upstream `iwe-org/iwe` releases. Removed vendored sidecar binary and submodule.
- **Vault-aware startup**: Detect iCloud/Dropbox/OneDrive vault paths, apply shorter init timeouts for cloud-backed vaults.
- **Document lifecycle**: Added `markdown_lsp_did_close` end-to-end. Editor features gated by provider health and capabilities.
- **MCP stdio transport**: Claude Code setup now prefers stdio via `carbide mcp` CLI proxy (matching Claude Desktop), avoiding bearer tokens in `.mcp.json`.
- **CLI install paths**: Default to `~/.local/bin/carbide` on macOS/Linux, `%LOCALAPPDATA%\Programs\Carbide\bin\carbide.exe` on Windows.
- **Comprehensive test coverage**: Wave 4 verification tests for provider types, status serde, toolchain registry, store state, service lifecycle, and release validation script.
