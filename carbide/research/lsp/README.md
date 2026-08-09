# LSP — index

Carbide runs concurrent language servers (markdown/IWE plus a generic layer).
These docs were scattered across `carbide/`, `carbide/plans/`, and
`carbide/research/` until 2026-08-09; they are grouped here.

| Doc | Topic | Status |
|---|---|---|
| `2026-03-25_generic_lsp.md` | Generic LSP layer alongside IWE — 7-step build plan | **Implemented** 2026-03-25 |
| `2026-04-30_editor_source_LSP_drilldown.md` | Editor coordination: wiki-suggest drill-down, source-mode hover/completion, dual hover tooltips | Issue 2 **done** (`d68f5382`), Issue 3 **done** (`7a91bede`); Issue 1 open |
| `lsp-tooltip-coexistence.md` | Investigation: three clashes between Carbide tooltips and LSP (hover, completion, go-to-definition) | Investigation complete — the fix for Clash 1 landed as Issue 3 above |
| `2026-05-01_lsp_sync.md` | `didChange` / completion debounce race | **Open** — see below |
| `lsp_manager_analysis.md` | Multi-language LSP manager feasibility for PDF omnifind | Feasibility only; not built |

## The one open correctness item

`textDocument/didChange` is debounced at 300 ms
(`lsp_document_sync.reactor.svelte.ts`); completion requests debounce at 200 ms
(`lsp_completion_plugin.ts`). Typing a trigger character can fire the completion
request ~100 ms *before* `didChange` reaches the server, so the server completes
against stale document content.

- **Option A (simple):** raise completion debounce past 350 ms. Slower UX.
- **Option B (correct, recommended):** flush the pending `didChange` before
  calling `on_completion()` — requires exposing a `flush_did_change()` callback
  from the document-sync reactor to the completion plugin.

Scoped as a separate PR; not yet done.

## Grammar / prose checking — Harper (2026-04-14)

Folded in from `carbide/archive/research/lsp/2026-04-14_lsp_harper.md`, which was a 6-line fragment.
Candidates evaluated for a second concurrent LSP:

| Candidate | What it is | Assessment |
|---|---|---|
| **Harper** | Rust grammar checker, fast, offline | Natural fit — Rust matches the stack, stdio LSP, same integration pattern, no network dependency |
| **ltex-ls** | LanguageTool-based grammar/spell/style | More thorough (multilingual, style rules) but Java — heavy packaging and startup cost for a Tauri app |
| **Vale LSP** | Prose linting (style, tone, consistency) via `.vale.ini` | Powerful but niche — aimed at editorial teams and docs-as-code rather than note-taking |

**Recommendation: Harper.** It would run as a second concurrent LSP alongside
`markdown_lsp` — a pattern Carbide already has with `code_lsp`. Not implemented.

## Corrupted artifacts

`carbide/archive/research/lsp/lsp_manager_implementation_analysis.md`
and `carbide/archive/research/lsp/lsp_manager_implementation_plan.md` are **not markdown** — they are Python dict
reprs with escaped Rust fragments embedded, produced by a broken export. They
are retained for history only; do not read them as documents. Their intended
content is covered by `lsp_manager_analysis.md`.
