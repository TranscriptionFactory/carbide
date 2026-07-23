# Task: TP-010 — Program-wide simplification pass
**Created:** 2026-07-23
**Size:** M
## Review Level: 1 (Plan Only)
**Assessment:** Read-mostly pass over the full agent-framework diff with edit authority; hard rule: simplification that breaks existing patterns, standards, gates, or the locked decisions is a defect.
**Score:** 2/8 — Blast radius: 2, Pattern novelty: 0, Security: 0, Reversibility: 0

## Canonical Task Folder
```
taskplane-tasks/TP-010-simplify-pass/
├── PROMPT.md
├── STATUS.md
├── .reviews/
└── .DONE
```

## Mission
Final quality gate for the generalized-agent-framework program (TP-002…TP-009). Review the integrated diff for accidental complexity: duplicated logic between the two harness adapters and the native loop, request/policy plumbing that grew extra layers, dead code left by the contract convergence (old channels/commands), and naming drift. Simplify ONLY where behavior, tests, the event contract, and repo standards are preserved. This mirrors the repo's post-feature convention (code-simplifier pass after major features).

## Dependencies
- **Task:** TP-006 (codex adapter)
- **Task:** TP-008 (agent citations)
- **Task:** TP-009 (agentic inline edit)

## Context to Read First
- `AGENTS.md` (simplicity + surgical-change rules), `docs/architecture.md`
- The integrated diff: `git diff <pre-program-commit>..HEAD -- src-tauri/src/features/ai src/lib/features/rag src/lib/features/ai src/lib/shared/types/ai_provider_config.ts`
- Frozen artifacts that must NOT change semantics: `AgentEvent` contract (additive extensions only), harness spawn-arg fixtures, safe ≡ read-only parity (TP-007), history replay + eviction (TP-003)

## File Scope
- Read: everything in the diff
- Edit: only files touched by TP-002…TP-009 (`src-tauri/src/features/ai/**`, `src/lib/features/rag/**`, `src/lib/features/ai/**`, `src/lib/shared/types/ai_provider_config.ts`, related tests)

## Steps
### Step 0: Preflight
- [ ] All dependency tasks merged; FULL gates green BEFORE any edit (nohup + poll → `.tmpfiles/`)

### Step 1: Simplification review + edits
- [ ] Dead code from convergence (old channel strings, unused types/imports) — remove only if provably unreferenced
- [ ] Duplicated logic across claude/codex adapters → shared helpers in `harness/mod.rs` (only true duplication, ≥3 near-identical lines)
- [ ] Plumbing layers: policy/request passing with no added value → flatten
- [ ] Naming consistency (agent_run / toolset / policy terms used uniformly)
- [ ] Every edit traces to simplification; NO behavior change, NO new abstractions for single-use code

### Step 2: Testing & Verification
- [ ] FULL gates after edits: `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test --manifest-path src-tauri/Cargo.toml` — all green; `pnpm format`
- [ ] `grep` sanity: no `native-agent-stream-event`, no `provider_supports_agent`, no `id === "claude"` in `src/`

### Step 3: Documentation & Delivery
- [ ] STATUS.md: list of simplifications applied + candidates deliberately REJECTED (with reason)

## Documentation Requirements
**Must Update:** none
**Check If Affected:** none

## Completion Criteria
- [ ] Diff reviewed end-to-end; simplifications applied or rejected-with-reason
- [ ] Gates green; zero semantic change to the frozen artifacts listed above

## Git Commit Convention
- `refactor(TP-010): simplify <area> — <what>`

## Do NOT
- Change behavior, tests' assertions' intent, the event contract, or locked user decisions
- "Improve" adjacent pre-existing code outside the program diff
- Expand scope — tech debt to `taskplane-tasks/CONTEXT.md`
