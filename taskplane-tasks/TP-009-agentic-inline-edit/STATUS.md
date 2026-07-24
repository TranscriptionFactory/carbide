# TP-009 — Agentic inline edit (diff-apply sink)

**Status:** Complete (R1 fast gates green)
**Branch:** wave-d/tp009

## What shipped

Native-capable API providers (`agent_capability(provider).backend === "native"`,
i.e. `openai_compat`) now get an agentic path for inline **edit** on **note**
context. Instead of a single-shot completion:

1. `AgenticEditRunner` takes a git checkpoint (`create_checkpoint("before inline
   edit")`) BEFORE any model call — inline edit previously had no checkpoint;
   this closes that gap.
2. Runs the in-process native agent loop via the shared `AgentPort.stream_turn`
   with `inline_edit_policy()`: the model reads around the note with
   `read_note` / `search_notes`, then emits its edit as the final assistant
   text.
3. That final text is folded and returned as an `AiExecutionResult`, which the
   existing `ai_execute` flow feeds into the SAME `ai_diff_view` approval UI
   (`create_ai_draft_diff` already builds from `result.output` for edit mode).
   The human applies the diff — that approval IS the inline permission story.

Everything else falls through unchanged: text-only CLI and claude/harness
providers keep the current blocking / single-shot streaming path; inline "ask"
mode is untouched; document (non-note) context stays on the old path.

## Capability gating decision

- Gate: `dialog.mode === "edit" && dialog.context.kind === "note" &&
  agent_capability(config)?.backend === "native" && vault`.
- Harness (claude) and codex/text-CLI providers are intentionally NOT agentic
  here — the mission scopes agentic inline edit to native API providers, and
  the harness inline path stays byte-stable.
- Document context is excluded because the note tools operate on vault notes;
  documents have no vault note to read around.

## Toolset / security decision (read-only, deliberate)

`inline_edit_policy()` carries `ToolSelector.Only(["read_note",
"search_notes"])` — **read-only**, NOT the mutating `edit_note` that the PROMPT
body suggested.

Rationale (per the TP-007 security brief): `ToolSelector::Only` does NOT pass
through the native/harness non-mutating filter (unlike `ReadOnly`), so any
mutating name handed to it is live. `edit_note` is `mutating: true` and writes
to disk directly. Exposing it would let the model bypass the diff-approval sink
and auto-write, violating the completion criterion "do NOT auto-apply agent
edits without the diff view." The inline surface's permission model is human
diff-approval, so it is a read-only (safe) surface: the model reads context,
proposes the edit as text, and the user approves it through the diff.

## prompt_mode / sink plumbing (for TP-010)

`prompt_mode: "inline_edit"` and `sink: "diff_apply"` remain **TS-side surface
descriptors only** — they are NOT sent to Rust and the frozen
`AgentStreamRequest` serde contract is untouched (File Scope: do not touch
Rust). They are realized entirely in TS:

- `sink: "diff_apply"` → the runner returns the final text as an
  `AiExecutionResult`; the existing diff/apply UI is the sink. No disk write.
- `prompt_mode: "inline_edit"` → the runner reuses the existing edit prompt
  (`AiService.build_execution_prompt`, now public) as the loop's user prompt,
  which already instructs the model to return the edited text. The native
  loop's own system prompt is left as-is.

If a future surface needs Rust to branch on prompt_mode/sink (e.g. a native
loop that emits proposed edits without a disk write so `edit_note` could be
offered safely), that plumbing is TP-010/beyond and would extend
`AgentStreamRequest` additively.

## Diff-apply UX observation

Because agentic output is a full proposed note/selection (same shape as the
single-shot edit output), it drops into `create_ai_draft_diff` with zero UI
changes. The streaming "Stop" affordance and streaming-text preview already
existed for the single-shot streaming path and are reused verbatim — no UI
file was touched.

## Gates (R1 fast, per-task)

- `pnpm check`: 0 errors.
- `pnpm lint`: layering passes; oxlint `--type-aware` adds no new errors in the
  changed files (`agentic_edit_runner.ts` is clean; remaining entries are the
  pre-existing never-green baseline).
- Targeted vitest (runner + policy + both ai-action harnesses): 40 passed.
- `pnpm format`: scoped, applied.
- No Rust touched → no `cargo test`.

## Files

- NEW `src/lib/features/ai/application/agentic_edit_runner.ts`
- `src/lib/features/ai/domain/agent_run_policy.ts` (`inline_edit_policy`)
- `src/lib/features/ai/application/ai_service.ts` (`build_execution_prompt` public)
- `src/lib/features/ai/application/ai_actions.ts` (agentic branch in `ai_execute`)
- `src/lib/features/ai/index.ts` (exports)
- `src/lib/app/di/create_app_context.ts` (runner wiring)
- tests: `tests/unit/services/agentic_edit_runner.test.ts`,
  `tests/unit/domain/agent_run_policy.test.ts`,
  `tests/unit/actions/register_ai_actions.test.ts`,
  `tests/unit/actions/register_ai_open_vault_in_agent.test.ts`
