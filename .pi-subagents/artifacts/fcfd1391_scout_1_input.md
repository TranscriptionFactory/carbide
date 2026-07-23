# Task for scout

Map the feature surface of the repo at /home/avocado/src/open-knowledge (a pnpm monorepo: packages/app, cli, core, desktop, plugin, server — an 'AI-native markdown IDE / LLM wiki', Electron macOS app + web UI + CLI). I need a factual capability inventory for a competitive analysis. For EACH dimension below, answer with what exists and cite 1-3 evidence file paths. Do not guess; if something is absent, say absent. Note: packages/docs is just the docs website — don't count hits there as product features unless the product code implements them.

1. Editor: framework (Tiptap/ProseMirror?), WYSIWYG vs raw source mode, markdown round-trip fidelity approach (they claim byte-fidelity + CRDT dual-observer — verify where)
2. File model: vault/project layout, frontmatter handling, where app settings/indexes/caches live, starter packs/templates concept
3. Search: engine (Orama? sqlite? FTS?), embeddings or semantic/vector search (local model? remote API? which provider?), 'agentic search' for MCP, any query language or saved queries
4. Links: wikilinks, backlinks panel, graph/link explorer view, embed/transclusion syntax (check packages/core/src/registry/wiki-embed-compat.test.ts and built-ins.ts — what Obsidian-compatible embeds exist?)
5. Structured data: properties/Dataview-like database views, tasks/todo management, kanban/calendar
6. Documents: PDF viewer (packages/app/src/editor/components/Pdf.tsx?), EPUB support (check packages/server/src/mcp/tools/ingest-body.ts — ingest only, or a reader?), HTML embedding/rendering (sandboxed? trust model? what can embedded HTML do?), CSV, canvas/whiteboard, spreadsheets, code files, images
7. Web clipping: browser extension, web import, URL-to-note
8. Citations/references: Zotero, BibTeX, DOI, bibliography features
9. Git: which git operations exposed in-app, auto-commit, how sync uses git/GitHub, LFS
10. Sync/collaboration: yjs CRDT details, team sharing model, GitHub publish flow
11. AI: providers supported (Claude/Codex/OpenCode/Pi — CLI or API? local models ollama/lmstudio?), in-app inline AI editing (side-by-side agent? embedded terminal?), RAG over vault with citations?, MCP server (list the actual MCP tools exposed, e.g. in packages/server/src/mcp/tools/), skills system, MCP client
12. Extensibility: packages/plugin — what is it? plugin API, marketplace, public API surface
13. Platforms (macOS Electron only? web UI for Linux/Windows?), license, telemetry/analytics (opt-in? posthog/sentry?)
14. Anything notable/unique not covered above (e.g. MDX/JSX components, publishing, slides).

Return a compact structured report, one short section per dimension, evidence paths inline.

---

Update progress at: /home/avocado/src/carbide/.pi-subagents/artifacts/progress/fcfd1391/progress.md

---

**Output:**
Write your findings to exactly this path: /home/avocado/src/carbide/.pi-subagents/artifacts/outputs/fcfd1391/.pi-subagents/artifacts/outputs/ok-recon.md
This path is authoritative for this run.
Ignore any other output filename or output path mentioned elsewhere, including output destinations in the base agent prompt, system prompt, or task instructions.

## Acceptance Contract

Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:

- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```
