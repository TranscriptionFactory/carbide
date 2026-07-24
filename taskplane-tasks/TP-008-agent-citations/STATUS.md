# TP-008 — Status

## Outcome

Agent-mode assistant turns now surface citations derived from their own path-bearing
read-tool events, rendered with the existing ask-mode "Sources" UI (numbered rows,
click-to-open-note via `rag_open_citation`).

## How citations are derived

- `agent_citations.ts::citations_from_tools(AgentToolCall[])` → `RagCitation[]`.
- Per turn, `rag_message.svelte` derives citations from `message.tool_events`
  (which are structurally `{ name, input_summary }`) when `message.citations` is
  empty (agent mode); ask-mode messages keep using their own streamed citations.
- Paths are extracted with the shared `paths_from_summary` (reused from
  `agent_file_ops.ts`), deduped by `note_path`, ordered by first appearance, and
  numbered `[1..n]`. Title falls back to the path basename (minus `.md`).

## Included-tool list (explicit const in `agent_citations.ts`)

- MCP (prefix `mcp__carbide__` stripped before matching): `read_note`,
  `get_note_metadata`.
- Built-in: `Read`.

Rationale:

- These are the read tools whose **input** carries a note/file path.
- `search_notes` / `list_notes` are intentionally excluded: their input is a
  query/folder, not a path, so they cannot source a path citation. Their result
  rows do carry paths, but `result_summary` is not captured in the frozen
  AgentEvent/RagToolEvent message model, and `agent_runner.ts` is out of scope
  for this task — so search-result citations are not derivable here.
- Mutating tools (`update_note`, `edit_note`, `Write`, `Edit`, …) are excluded by
  virtue of the allowlist — an edit is not a citation.

## Truncation-fallback behavior

`input_summary` is the tool input JSON truncated to ~200 chars by the Rust
normalizer, which can break the JSON. `paths_from_summary` already handles this:
a summary that starts with `{` but fails to parse yields no paths, so a truncated
read call simply produces no citation (silent skip, no crash). A bare
non-JSON summary is treated as a raw path.

## Gates (fast, per-task)

- `pnpm check`: 0 errors.
- Targeted vitest (`agent_citations`, `agent_file_ops`, `rag_message_agent`): 25 passed.
- `pnpm lint`: no new errors in touched files.
- `pnpm format`: applied, scoped to touched files.
