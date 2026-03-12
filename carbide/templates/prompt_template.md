# Carbide Phase Implementation Prompt

Implement Phase {{PHASE_NUMBER}} of Carbide.

## Context

- Project guide: carbide/carbide-project-guide.md
- TODO tracker: carbide/TODO.md
- Phase history: carbide/archive/phase_{{PHASE_NUMBER}}.md
- This is a fork of Otterly (Tauri v2 + Milkdown markdown editor)
- Moraya (/Users/abir/src/moraya) is a reference codebase for adapted features

## Instructions

1. Read carbide/carbide-project-guide.md — find the section for Phase {{PHASE_NUMBER}}
   in the feature list (Tier 1/2/3) AND the matching follow-up prompt (Part 3).
   These are your requirements.

2. Read carbide/TODO.md — find the Phase {{PHASE_NUMBER}} section.
   These are your implementation tasks. Mark each task as you go:
   - `[~]` when you start working on it
   - `[x]` when complete
   - `[-]` if dropped with a reason

3. Before writing code, read docs/architecture.md and follow
   its decision tree. Follow AGENTS.md guidelines strictly. Copy any phase-specific
   plan or implementation notes into `carbide/archive/phase_{{PHASE_NUMBER}}.md`.

4. Implement the phase:
   - Follow Otterly's existing architecture when appropriate (ports & adapters, layered services,
     action registry, Svelte 5 stores); note, architecture changes will be necessary at later points
   - Use the same file/folder conventions (snake_case, feature modules)
   - Prefer extending existing code over creating parallel structures
   - Reference Moraya's codebase where the TODO/guide says "adapt from Moraya"

5. After code changes, run all checks:
   - pnpm check
   - pnpm lint
   - pnpm test
   - cd src-tauri && cargo check
   - pnpm format

6. Add tests in tests/ for non-trivial logic.

7. Commit frequently — one commit per logical unit of work, NOT one big commit
   at the end. Examples of good commit boundaries:
   - After adding a new component or store
   - After wiring up a service or port
   - After each TODO task or small group of related tasks
   - After fixing issues found by checks/tests
     Commit before moving to the next task. Use descriptive messages.
     Create a feature branch (feat/phase-{{PHASE_NUMBER}}-<name>) if >2 files change.

8. Update carbide/TODO.md as you go (not just at the end):
   - Mark tasks `[~]` when starting, `[x]` when complete, `[-]` if dropped
   - Add any new tasks discovered during implementation
   - TODO updates can be part of the same commit as the related code change

9. Write to `carbide/archive/phase_{{PHASE_NUMBER}}.md` to include:
   - Plan documents
   - updates on development and outcome post implementation
