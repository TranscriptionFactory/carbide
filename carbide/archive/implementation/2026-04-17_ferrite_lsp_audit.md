# Ferrite LSP Audit — Findings for Carbide

**Date:** 2026-04-17
**Source:** Ferrite @ `/Users/abir/src/KBM_Notes/Ferrite/` (commit range around `7dc3415e`)
**Status:** Review complete — no significant ports needed

## Summary

Carbide's LSP implementation is a generation ahead of Ferrite's. Ferrite only has diagnostics wired up (inline squiggles + hover on diagnostic ranges). Completions, hover docs, go-to-definition, references, code actions, inlay hints, rename, and formatting are all unimplemented in Ferrite.

Carbide already covers the full LSP surface across both markdown (IWE/Markdown Oxide/Marksman fallback chain) and generic code servers, with rich ProseMirror plugins, a Rust `RestartableLspClient`, generation counters for stale result discard, and coexistence logic (LSP completion defers when wiki-suggest is active).

## Ferrite Architecture (for reference)

```
src/lsp/
  mod.rs          — Re-exports, path utils, language_id_for_path()
  detection.rs    — Extension → LspServerSpec mapping, install hints, workspace scan
  manager.rs      — Background worker thread, process lifecycle, JSON-RPC dispatch
  state.rs        — DiagnosticEntry, DiagnosticMap, ServerStatus
  transport.rs    — Content-Length framing encode/decode, MessageReader
src/lsp_stub.rs   — No-op mirrors (feature-flag gating)
```

- Feature-gated behind `lsp` cargo feature (off by default)
- Extension-based detection: rust-analyzer, pylsp, gopls, typescript-language-server, clangd, etc.
- No markdown LSP (`.md` returns `None` from detection)
- Full-text document sync with 300ms debounce
- Crash recovery with exponential backoff (1s → 30s max, resets after 60s uptime)
- Idle shutdown: 30s timer after last matching tab closes

### Known Ferrite Issues
- Unbounded `mpsc` channels (no backpressure)
- Full-document sync only (no incremental)
- No frame-size cap on transport (malformed messages → unbounded alloc)
- UTF-16 column offset bug (squiggles misalign on non-ASCII)
- rust-analyzer reported ~3.8 GB memory usage

## Actionable Items for Carbide

### 1. Audit idle server shutdown (low effort)
Ferrite stops code LSP servers 30s after the last matching tab closes. Verify Carbide's `code_lsp` does the same — lingering servers (especially rust-analyzer) eat significant memory.

### 2. Install-hint toasts on spawn failure (low effort, nice UX)
Ferrite shows a 6-second toast with install guidance when a server binary isn't found (e.g., "Install via: `rustup component add rust-analyzer`"). Carbide likely surfaces spawn errors but may not give actionable install instructions.

### 3. CodeMirror 6 LSP plugins (significant effort, greenfield)
The real remaining gap. All Carbide LSP plugins are ProseMirror-only. Source editor (CodeMirror 6) has zero LSP wiring. This is Carbide-internal work, not a Ferrite port (Ferrite uses egui). Relevant plugins to wire:
- Completion (trigger characters, dropdown)
- Hover tooltips
- Go-to-definition
- Diagnostics decorations
- Inlay hints (if applicable to markdown)

### 4. UTF-16 column offset audit (verification only)
Ferrite has a known bug treating LSP UTF-16 offsets as byte/char indices. Verify Carbide's `lsp_plugin_utils.ts` (`line_and_character_from_pos`, `offset_for_line_character`) handles multi-byte characters correctly.

## Not Worth Porting

| Ferrite pattern | Reason to skip |
|---|---|
| `lsp_stub.rs` no-op pattern (feature-flag gating) | LSP is core to Carbide |
| Extension-based detection | Carbide already has `which`-based detection + provider fallback |
| Settings UI for detected workspace servers | Low value; Carbide's provider resolution is sufficient |
| Crash recovery with backoff | Carbide's `RestartableLspClient` already does this (3 attempts, 1s/2s/4s) |
| Document sync debounce | Carbide already has configurable debounce via `lsp_document_sync.reactor` |
