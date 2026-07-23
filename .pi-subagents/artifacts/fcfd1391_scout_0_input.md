# Task for scout

Map the feature surface of the repo at /home/avocado/src/tolaria (a Tauri+React markdown knowledge-base app). I need a factual capability inventory for a competitive analysis. For EACH dimension below, answer with what exists and cite 1-3 evidence file paths. Do not guess; if something is absent, say absent (check package.json deps, src/, src-tauri/src/, mcp-server/, docs/, site/).

1. Editor: framework (BlockNote? Tiptap?), WYSIWYG vs raw source mode, markdown round-trip fidelity approach
2. File model: vault layout, frontmatter handling, where app settings/indexes/caches live, note 'types'/collections concept
3. Search: engine (ripgrep/tantivy/sqlite/JS?), full-text search, embeddings or semantic/vector search (local model? remote?), any query language or saved queries
4. Links: wikilinks, backlinks panel, graph view, embed/transclusion syntax (Obsidian-style ![[...]]?)
5. Structured data: properties/Dataview-like database views, tasks/todo management, kanban/calendar views
6. Documents: PDF viewer, EPUB reader, HTML file rendering (sandboxed? trust model?), CSV viewer, canvas (tldraw/excalidraw), spreadsheets (ironcalc?), code files, images
7. Web clipping: browser extension, web import, URL-to-note
8. Citations/references: Zotero, BibTeX, DOI, bibliography features
9. Git: which git operations exposed in-app (init/status/commit/diff/restore/remotes/sync), auto-commit, LFS handling
10. Sync/collaboration: CRDT, multiplayer, team sharing, GitHub publish
11. AI: providers supported (which CLIs/APIs? local models like ollama/lmstudio?), in-app inline AI edit, RAG/chat over vault with citations, MCP server (list the actual MCP tools it exposes), MCP client, agent docs (AGENTS.md generation?)
12. Extensibility: plugin/extension system, marketplace, public API
13. Platforms (OS targets), license, telemetry/analytics (posthog? sentry? opt-in?)
14. Anything notable/unique not covered above (e.g. spreadsheets, slides, publishing).

Return a compact structured report, one short section per dimension, evidence paths inline.

---

Update progress at: /home/avocado/src/carbide/.pi-subagents/artifacts/progress/fcfd1391/progress.md

---

**Output:**
Write your findings to exactly this path: /home/avocado/src/carbide/.pi-subagents/artifacts/outputs/fcfd1391/.pi-subagents/artifacts/outputs/tolaria-recon.md
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
