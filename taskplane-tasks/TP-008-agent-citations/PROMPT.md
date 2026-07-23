# Task: TP-008 — Citations in agent mode (from tool results)

**Created:** 2026-07-23
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** Read-mostly UI + domain mapping on top of existing tool-event transcript; reuses ask-mode citation rendering.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Canonical Task Folder

```
taskplane-tasks/TP-008-agent-citations/
├── PROMPT.md
├── STATUS.md
├── .reviews/
└── .DONE
```

## Mission

Locked user decision (2026-07-23): agent-mode answers should surface citations like ask-mode does. Today an agent turn renders tool-event rows but no citation block, even when the answer came from `search_notes`/`read_note`. Derive citation rows from the turn's tool events (path-bearing read tools), dedupe by note path, render with the existing ask-mode citation UI, and wire click-to-open-note.

## Dependencies

- **Task:** TP-002 (unified adapter/contract in place)

## Context to Read First

- `AGENTS.md`, `docs/architecture.md`
- `src/lib/features/rag/domain/agent_file_ops.ts` — `paths_from_summary()` (parses possibly-truncated JSON input summaries; REUSE this logic for path extraction), `AgentToolCall`
- `src/lib/features/rag/domain/rag_citations.ts` + `src/lib/features/rag/domain/rag_types.ts` — `RagCitation` shape, how ask-mode messages carry citations
- `src/lib/features/rag/ui/rag_message.svelte` — citation rendering (ask mode) + tool-event rows (agent mode)
- `src/lib/features/rag/application/rag_actions.ts` — existing note-open action pattern (there is an action that opens a note by path from a rag payload)
- MCP read-tool catalog for path-bearing tools: `src-tauri/src/features/mcp/tools/notes.rs`, `search.rs` (tool names + arg keys: `path`/`query` — note `search_notes` takes a query, its RESULTS carry paths; `read_note` takes `path`)

## File Scope

- `src/lib/features/rag/domain/agent_citations.ts` (NEW) and/or `agent_file_ops.ts` (extend)
- `src/lib/features/rag/ui/rag_message.svelte`
- `src/lib/features/rag/domain/rag_types.ts` (only if message shape needs a citations carrier for agent turns)
- `src/lib/features/rag/state/rag_store.svelte.ts` (only if streaming state must collect citations)
- `tests/unit/**` citation-derivation tests (+ component test if rag_message has one)

Do NOT touch: Rust code, `agent_runner.ts` (TP-003/TP-009 territory), `ai_provider_capabilities.ts`, settings.

## Steps

### Step 0: Preflight

- [ ] TP-002 merged; gitignored `src/lib/generated/bindings.ts` + `src-tauri/excalidraw-dist/` present
- [ ] Baseline: `pnpm vitest run tests/unit/domain/agent_file_ops.test.ts` green

### Step 1: Citation derivation domain

- [ ] `agent_citations.ts`: map `AgentToolCall[]` → citation rows `{ note_path, title? }` (match `RagCitation`-compatible shape)
- [ ] Source tools: `read_note` (path from input), `search_notes`/`query_notes_by_property`/other read tools whose input summary contains paths (reuse `paths_from_summary`); EXCLUDE mutating tools' outputs from citations (an edit is not a citation) — record the included-tool list as an explicit const
- [ ] Dedupe by `note_path`, order by first appearance; strip `mcp__carbide__` prefix when matching tool names

### Step 2: Render + open

- [ ] `rag_message.svelte`: agent-mode assistant messages render a citation block (same component/markup as ask-mode citations) beneath the text when citations exist
- [ ] Click → existing note-open action

### Step 3: Tests

- [ ] Vitest: derivation (single/multiple/duped paths, truncated-JSON summary fallback, mutating-tool exclusion, prefix stripping)
- [ ] Component-level: agent message with citation-bearing tool events renders citation rows; no block when none

### Step 4: Testing & Verification

- [ ] FULL gates (nohup + poll → `.tmpfiles/`): `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test --manifest-path src-tauri/Cargo.toml`; `pnpm format`

### Step 5: Documentation & Delivery

- [ ] STATUS.md: included-tool list + truncation-fallback behavior

## Documentation Requirements

**Must Update:** none
**Check If Affected:** agent-mode docs under `docs/` if present

## Completion Criteria

- [ ] Agent turns show deduped citations from read tools; click opens note
- [ ] All gates green

## Git Commit Convention

- `feat(TP-008): complete Step N — description`; tests `test(TP-008): …`

## Do NOT

- Change the Rust event contract or tool definitions
- Build a new citation UI (reuse ask-mode's)
- Expand scope — tech debt to `taskplane-tasks/CONTEXT.md`
