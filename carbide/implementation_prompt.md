You are running headless with no human in the loop. Complete exactly ONE unit from the work units checklist, then stop.

## Phase 0: Find the unit

1. Read `carbide/2026-04-05_conversation_work_units.md`.
2. Find the first unchecked `[ ]` unit whose step dependencies are met (prior dependent steps have all units `[x]`, or step says "depends on: nothing").
3. If ALL units are checked, output "All units complete." and stop.

## Phase 1: Orient

4. Read the **design reference** listed in that step's header (e.g., `carbide/mcp_native_gaps_plan.md` → specific section). This is the detailed spec.
5. Read `docs/architecture.md` for the decision tree governing where code goes.
6. Run `git log --oneline -10 && git status`.
7. Check if the step's branch exists. Create or switch to it. If prior units on this branch have completion notes, read their commits.

## Phase 2: Implement

8. **Locate files first.** Use Serena tools (load via ToolSearch), Grep, or Glob. List what you'll touch before writing code.
9. **Implement the unit.** Follow AGENTS.md conventions:
   - Hexagonal architecture (ports, adapters, services, stores)
   - `#[specta::specta]` on all Tauri commands
   - Snake case file names
   - No comments/docstrings except on non-obvious code
   - Extend existing functions before creating new ones
   - shadcn semantic utilities for UI
10. **Write tests** for non-trivial logic in `tests/`. Deterministic, readable, fail loudly.
11. **≤8 files.** If scope pushes beyond 8 files, stop. Commit what you have, mark the unit `[~]` partial, and note what remains.

## Phase 3: Verify

12. Run all checks and fix issues. Loop until clean:
    ```
    pnpm format
    pnpm check
    pnpm lint
    pnpm test
    cd src-tauri && cargo check
    ```
13. If a check fails and you cannot fix it within 3 attempts, commit what works, mark the unit `[~]` partial, and document the failure.

## Phase 4: Commit

14. Stage only the files you changed (no `git add -A`).
15. Commit:

    ```
    feat(<scope>): <what changed>

    <why / intent>

    Next: <next unit ID and title, or blocker>
    ```

16. Do NOT push, merge, or amend.

## Phase 5: Update progress

17. Edit `carbide/2026-04-05_conversation_work_units.md`:
    - Change `[ ]` to `[x]` (or `[~]` if partial).
    - Add a completion note indented below the unit:
      ```
      - [x] **X.Y** Title
        - ...original description unchanged...
        - _Completed YYYY-MM-DD `abcdef1`. <What was built. Decisions made. What next unit needs to know.>_
      ```
    - Update `**Progress:** N / 46 units complete` at the top.
18. Commit the progress update:
    ```
    chore: mark unit X.Y complete
    ```

## Phase 6: Report

19. Output a summary:
    - Unit completed (or partial + what remains)
    - Files changed
    - All checks passing? (which failed if not)
    - Design decisions made and rationale
    - Next unit ID and title

## Guardrails

- **No human available.** Make decisions, don't ask. Document decisions in commits.
- **Stay in scope.** Don't fix unrelated issues — note them in the work units doc if important.
- **No destructive git.** No force push, reset --hard, branch -D.
- **No pushing to remote.** Local commits only.
- **If blocked** on a dependency from a prior incomplete unit, mark as blocked and stop.
- **One design decision max.** If the unit forces a second non-obvious choice, pick the simpler option and document why.
- **Follow existing patterns.** When unsure, find a similar feature in the codebase and mirror its structure.
