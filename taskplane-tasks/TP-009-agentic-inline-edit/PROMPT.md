# Task: TP-009 — Agentic inline edit (diff-apply sink)
**Created:** 2026-07-23
**Size:** L
## Review Level: 2 (Plan and Code)
**Assessment:** New auto-edit path into the editor (security-sensitive apply surface) wiring the ai feature to the agent framework; blocking CLI path must stay byte-stable for text-only providers.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 1 (automated edit apply path), Reversibility: 0

## Canonical Task Folder
```
taskplane-tasks/TP-009-agentic-inline-edit/
├── PROMPT.md
├── STATUS.md
├── .reviews/
└── .DONE
```

## Mission
Give the inline AI panel an "agentic edit" path for agent-capable API providers: instead of a single-shot completion, run the native agent loop with a note-tools toolset (`read_note`, `search_notes`, `edit_note`) so the model can read around the note before editing — then route the final assistant text through the EXISTING diff-approval UI (`ai_diff_view`) as the apply step. A git checkpoint is created before every agentic edit run (today inline edit has NO checkpoint — this closes that gap). Text-only CLI providers keep the current blocking execute path, untouched.

## Dependencies
- **Task:** TP-007 (`SurfacePolicy`/`ToolSelector` incl. `diff_apply` sink)
- **Task:** TP-003 (history replay — inline dialog turns replay too)

## Context to Read First
- `AGENTS.md`, `docs/architecture.md`
- `src/lib/features/ai/application/ai_service.ts` + `ai_actions.ts` — current edit/ask flows, `AiMode = "edit" | "ask"`
- `src/lib/features/ai/ui/ai_edit_dialog.svelte`, `ai_edit_dialog_content.svelte`, `ai_diff_view.svelte` — the apply surface
- `src/lib/features/ai/state/ai_store.svelte.ts` — dialog session state
- `src/lib/features/ai/domain/agent_run_policy.ts` (TP-007) — `SurfacePolicy`, `Only(...)` selector
- `src/lib/features/rag/application/agent_runner.ts` — checkpoint pattern (`AgentCheckpointGit.create_checkpoint("before agent turn")`) and stream folding; NOTE it is RagStore-coupled — this task needs an equivalent small runner for the ai dialog session (do NOT refactor AgentRunner into shared form unless trivially clean; duplicating ~40 lines is acceptable per simplicity-first)
- `src/lib/features/ai/domain/ai_provider_capabilities.ts` — capability gate

## File Scope
- `src/lib/features/ai/application/ai_actions.ts`
- `src/lib/features/ai/application/ai_service.ts`
- `src/lib/features/ai/state/ai_store.svelte.ts`
- `src/lib/features/ai/ui/ai_edit_dialog_content.svelte` (running/abort affordance)
- `src/lib/features/ai/application/agentic_edit_runner.ts` (NEW, small — mirrors agent_runner concerns for the dialog)
- `tests/unit/**` ai-feature tests

Do NOT touch: rag feature files, Rust code (the `Only` toolset + native loop already support this), settings catalog, blocking CLI execute path.

## Steps
### Step 0: Preflight
- [ ] TP-007 + TP-003 merged; gitignored `src/lib/generated/bindings.ts` + `src-tauri/excalidraw-dist/` present
- [ ] Baseline: `pnpm vitest run tests/unit` ai-feature tests green

### Step 1: Inline policy + runner
- [ ] `inline_edit_policy()`: `SurfacePolicy { toolset: Only(["read_note", "search_notes", "edit_note"]), prompt_mode: "inline_edit", sink: "diff_apply" }`
- [ ] `agentic_edit_runner.ts`: checkpoint via git service → `agent_port.stream_turn` (native backend, policy) → fold events → final assistant text out; abort via AbortController; errors humanized via existing `humanize_ai_error`
- [ ] Wire into the edit flow ONLY when `agent_capability(provider)` is native-capable; everything else falls through to the current path unchanged

### Step 2: Diff-apply sink + UI state
- [ ] Final assistant text → existing diff view → user applies (human approval preserved — this IS the permission story for inline)
- [ ] Running state + Stop affordance in the dialog (reuse existing streaming affordance); abort stops dispatch mid-loop (native abort path already exists)

### Step 3: BDD scenarios 8 + 10
- [ ] Vitest w/ fake AgentPort: selection edit → events folded → final text → diff apply → editor updated; git checkpoint created BEFORE stream start (order asserted)
- [ ] Abort mid-run → no further events folded, dialog returns to idle, partial text not applied
- [ ] Text-only CLI provider → takes the OLD path (regression test)

### Step 4: Testing & Verification
- [ ] FULL gates (nohup + poll → `.tmpfiles/`): `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test --manifest-path src-tauri/Cargo.toml`; `pnpm format`

### Step 5: Documentation & Delivery
- [ ] STATUS.md: capability gating decisions + anything observed about diff-apply UX with agentic output

## Documentation Requirements
**Must Update:** none
**Check If Affected:** AI panel docs under `docs/` if present

## Completion Criteria
- [ ] Agentic edit works end-to-end with fake port; checkpoint-before-run proven; abort proven
- [ ] Blocking CLI path byte-stable
- [ ] All gates green

## Git Commit Convention
- `feat(TP-009): complete Step N — description`

## Do NOT
- Auto-apply agent edits without the diff view (human approval is the inline permission model)
- Add tool-event row UI to the dialog (YAGNI — streaming text + stop only)
- Refactor `AgentRunner` (rag) — small duplication accepted
- Expand scope — tech debt to `taskplane-tasks/CONTEXT.md`
