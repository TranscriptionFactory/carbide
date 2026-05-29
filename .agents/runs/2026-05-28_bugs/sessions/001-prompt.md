You are executing an autonomous multi-session implementation run.

Canonical implementation plan:
/Users/abir/src/carbide/carbide/plans/2026-05-28_bugs_implementation_plan.md

Run state directory:
/Users/abir/src/carbide/.agents/runs/2026-05-28_bugs

This is session 001. The outer driver will run at most 10 sessions.

Your task for this session:

1. Read the canonical implementation plan.
2. Identify the next incomplete phase in that existing plan.
3. Complete exactly that one phase. Do not start later phases unless the plan explicitly says the current phase includes them.
4. Keep changes surgical and scoped to that phase.
5. Run the relevant verification for the phase.
6. Update the canonical plan document to mark the phase complete, record what changed, and record verification results.
7. Update /Users/abir/src/carbide/.agents/runs/2026-05-28_bugs/handoff.md with a concise handoff for the next fresh session: completed phase, files changed, verification, remaining work, and risks.
8. Overwrite /Users/abir/src/carbide/.agents/runs/2026-05-28_bugs/status.env with exactly these shell-style keys:
   STATUS=continue|complete|blocked
   LAST_SESSION=001
   LAST_PHASE="<phase name or number>"
   LAST_COMMIT="<commit hash, after committing>"
   BLOCKER="<empty unless blocked>"
   UPDATED_AT="<UTC timestamp>"
9. Commit all changes before exiting. Use a clear three-line commit message when possible.
10. Stop after this one phase. Do not continue into the next phase in this session.

Status rules:

- Use STATUS=continue when this phase is complete and more phases remain.
- Use STATUS=complete when this phase is complete and the whole plan is done.
- Use STATUS=blocked when you cannot safely complete the phase; document the blocker in the plan, handoff, and BLOCKER.

Important safety contract:

- The plan is the human source of truth.
- /Users/abir/src/carbide/.agents/runs/2026-05-28_bugs/status.env is only the machine-readable loop signal for the outer driver.
- If git is dirty when you finish, commit or explicitly mark STATUS=blocked with the reason.
