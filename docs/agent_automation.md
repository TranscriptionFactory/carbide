# Agent Automation Guide

## Purpose

This document explains two practical ways to automate an iterative coding-agent loop such as:

1. specify a prompt
2. start Codex with that prompt
3. wait for implementation to finish
4. inspect output and ask for next steps
5. start a fresh conversation with the next instructions

The two approaches covered here are:

- agent orchestration frameworks
- CLI/TUI automation tools

## When to use which

| Approach                       | Best for                                                                   | Strengths                                                             | Weaknesses                                             |
| ------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| Agent orchestration frameworks | durable multi-step workflows, API-driven systems, retries, branching logic | structured state, observability, tool composition, reusable workflows | more setup, usually requires API-first integration     |
| CLI/TUI automation tools       | driving an existing local Codex CLI workflow                               | simple, fast, minimal infrastructure, good for local repos            | more brittle, weaker state management, harder to scale |

## Common workflow model

Both approaches should implement the same loop:

1. load task context
2. create a fresh run/session
3. send the implementation prompt
4. wait until the run is complete
5. collect artifacts
   - assistant summary
   - git diff
   - test results
   - commit hash if one was created
6. derive the next-step prompt
7. start a new run/session
8. repeat until stop conditions are met

A good automation layer should also track:

- exact prompt sent
- repository revision before and after the run
- validation commands executed
- known unrelated failures to ignore
- a clear stop condition

## 1. Agent orchestration frameworks

### What they are

Agent orchestration frameworks let you model the workflow explicitly as a state machine or graph. Instead of scripting terminal keystrokes, you define steps such as:

- prepare prompt
- launch agent run
- wait for completion
- summarize changes
- decide next step
- launch next run

Examples include:

- LangGraph
- AutoGen
- CrewAI
- custom OpenAI Responses/Agents wrappers
- Temporal or Prefect when you want stronger workflow guarantees

### Best-fit architecture

A clean structure usually has these components:

- `planner`
  - decides the next instruction set
- `runner`
  - starts a Codex/API run
- `observer`
  - polls or receives completion events
- `repo_inspector`
  - reads git status, diff, tests, commits
- `validator`
  - runs `pnpm check`, `pnpm test`, etc.
- `next_step_generator`
  - turns results into the next fresh-session prompt
- `state_store`
  - persists workflow state between runs

### Recommended state shape

Keep explicit workflow state such as:

```json
{
  "task_id": "lite-bootstrap-pruning",
  "iteration": 3,
  "base_commit": "fc451900",
  "current_branch": "carbide-lite",
  "last_prompt": "...",
  "last_run_status": "completed",
  "validation": {
    "check": "passed",
    "lint": "known_unrelated_failures",
    "test": "known_unrelated_failure_document_service",
    "cargo_check": "passed"
  },
  "next_goal": "remove remaining placeholder full-only typing assumptions"
}
```

### Typical flow

#### Step 1: create a task spec

Define:

- objective
- constraints
- files/docs to read first
- validation commands
- known allowed failures
- completion criteria

#### Step 2: launch a fresh run

Use your framework to send a single bounded prompt to Codex or another coding agent.

Good prompts should include:

- current commit/hash
- docs to read first
- exact scope
- explicit non-goals
- validation requirements
- expected deliverables

#### Step 3: wait for completion

Preferred options:

- webhook/event callback if the platform supports it
- polling run status if not

Capture:

- final assistant response
- structured output if available
- execution logs
- file changes

#### Step 4: inspect repo state

After completion, automatically gather:

- `git status --short`
- `git diff --stat`
- latest commit message
- test/check outputs

#### Step 5: compute next step

The planner should answer:

- did the run finish successfully?
- did it satisfy the requested scope?
- are there blockers?
- what is the narrowest next slice?
- should the next run be a fresh conversation?

#### Step 6: start a new conversation

Carry forward only the minimal needed context:

- latest commit hash
- summary of what changed
- remaining target
- validation status
- warnings about intentional seams to preserve

This keeps runs clean and prevents context drift.

### Advantages

- durable and resumable
- easy to add branching or approvals
- better for long-running or team workflows
- easier to log and audit
- easier to integrate with GitHub, Slack, CI, issue trackers

### Risks

- over-engineering for a simple local loop
- too much context accumulation
- planner generating vague next steps
- accidental retries over dirty repo state

### Best practices

- always launch fresh runs for new implementation slices
- keep each run narrow and testable
- store exact prompts and outputs
- snapshot repo state before and after every run
- fail closed if the repo is dirty in unexpected ways
- explicitly encode known unrelated failures so the planner does not chase noise

### Minimal example design

```text
TaskSpec -> PromptBuilder -> AgentRun -> Wait -> RepoInspect -> Validate -> NextStepPrompt -> New AgentRun
```

### Python orchestration starter template

The simplest useful framework-style implementation is a Python controller that treats the agent as a run-producing service and keeps workflow state in a local JSON file.

```python
from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
import json
import subprocess
import time

STATE_PATH = Path("automation/state/lite_pruning.json")
PROMPT_PATH = Path("automation/prompts/current_prompt.md")
LOG_DIR = Path("automation/logs")


@dataclass
class WorkflowState:
    task_id: str
    iteration: int
    branch: str
    base_commit: str
    last_commit: str | None
    last_prompt_path: str | None
    last_run_status: str | None
    next_goal: str


class RepoInspector:
    def run(self, *args: str) -> str:
        return subprocess.check_output(args, text=True).strip()

    def snapshot(self) -> dict[str, str]:
        return {
            "branch": self.run("git", "branch", "--show-current"),
            "head": self.run("git", "rev-parse", "HEAD"),
            "status": self.run("git", "status", "--short"),
            "last_commit": self.run("git", "log", "--oneline", "-1"),
            "diff_stat": self.run("git", "diff", "--stat"),
        }


class Validator:
    def run(self) -> dict[str, int]:
        commands = {
            "check": ["pnpm", "check"],
            "lint": ["pnpm", "lint"],
            "test": ["pnpm", "test"],
        }
        results = {}
        for name, command in commands.items():
            proc = subprocess.run(command)
            results[name] = proc.returncode
        return results


class PromptBuilder:
    def build(self, state: WorkflowState, repo: dict[str, str]) -> str:
        return f"""Continue from commit {repo['head']}.

Read first:
- AGENTS.md
- docs/architecture.md
- carbide/plans/2026-04-03_carbide_lite_bootstrap_split_plan.md
- carbide/plans/2026-04-03_carbide_lite_standalone_app_plan.md

Goal:
- {state.next_goal}

Constraints:
- keep lint/formatter support intact for lite
- keep the door open for LSP/markdown-lsp
- preserve full behavior exactly

Deliver:
- code changes
- focused tests
- validation summary
- commit
"""


class AgentRunner:
    def start_run(self, prompt_text: str) -> Path:
        PROMPT_PATH.parent.mkdir(parents=True, exist_ok=True)
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        PROMPT_PATH.write_text(prompt_text)
        log_path = LOG_DIR / f"run_{int(time.time())}.log"
        with log_path.open("w") as log_file:
            subprocess.run(["codex", "exec", str(PROMPT_PATH)], stdout=log_file, stderr=subprocess.STDOUT)
        return log_path


class NextStepGenerator:
    def build(self, repo: dict[str, str], validation: dict[str, int]) -> str:
        if validation["check"] != 0:
            return "fix the typecheck regression introduced in the last slice"
        if validation["test"] != 0:
            return "inspect whether the failing tests are newly introduced or known unrelated failures"
        return "remove the next lite/full shared typing placeholder seam"


def load_state() -> WorkflowState:
    if not STATE_PATH.exists():
        return WorkflowState(
            task_id="lite-bootstrap-pruning",
            iteration=1,
            branch="carbide-lite",
            base_commit="HEAD",
            last_commit=None,
            last_prompt_path=None,
            last_run_status=None,
            next_goal="remove the next lite/full shared typing placeholder seam",
        )
    return WorkflowState(**json.loads(STATE_PATH.read_text()))


def save_state(state: WorkflowState) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(asdict(state), indent=2))


def main() -> None:
    state = load_state()
    repo_inspector = RepoInspector()
    validator = Validator()
    prompt_builder = PromptBuilder()
    runner = AgentRunner()
    next_step = NextStepGenerator()

    repo_before = repo_inspector.snapshot()
    prompt = prompt_builder.build(state, repo_before)
    log_path = runner.start_run(prompt)
    validation = validator.run()
    repo_after = repo_inspector.snapshot()

    state.iteration += 1
    state.last_commit = repo_after["head"]
    state.last_prompt_path = str(PROMPT_PATH)
    state.last_run_status = "completed"
    state.next_goal = next_step.build(repo_after, validation)
    save_state(state)

    print("log:", log_path)
    print("next goal:", state.next_goal)


if __name__ == "__main__":
    main()
```

This example is intentionally small. In production, add:

- explicit run IDs
- retry limits
- parsing of known unrelated failures
- stop conditions
- structured logs per iteration
- separate validation logs instead of mixed stdout

### Framework template design notes

A good first version should keep three boundaries clean:

- prompt construction should be pure and deterministic
- agent execution should be replaceable
- next-step generation should consume repo state, not vague memory

That makes it easy to migrate from a local CLI-backed runner to a real API-backed orchestrator later.

### Good use cases

- multi-day refactors
- autonomous implementation queues
- issue-driven coding pipelines
- workflows that need retries, approvals, or human checkpoints

## 2. CLI/TUI automation tools

### What they are

These tools drive a local interactive agent process rather than an API workflow.

Typical options:

- `tmux`
- `screen`
- `expect`
- `pexpect`
- shell scripts around a Codex CLI

This is the most practical approach when your main interface is already terminal-based.

### Best-fit architecture

Use a thin local controller with four responsibilities:

- start a fresh terminal session
- inject a prompt
- detect completion
- inspect repo state and build the next prompt

### Common patterns

#### Pattern A: tmux-driven automation

Use `tmux` when you want a visible, debuggable terminal session.

Typical flow:

1. create a new tmux session/window
2. start the Codex CLI
3. paste/send the prompt
4. wait for a recognizable completion signal
5. capture pane output
6. run repo inspection commands
7. kill the session
8. create a fresh session for the next step

Strengths:

- easy to debug manually
- easy to attach live if the run goes wrong
- good for local-only automation

Weaknesses:

- completion detection can be fragile
- terminal rendering can be noisy
- parsing output is less structured

#### Pattern B: expect/pexpect automation

Use `expect` or Python `pexpect` when you need scripted interaction with a terminal program.

Typical flow:

1. spawn Codex CLI process
2. wait for prompt-ready text
3. send implementation instructions
4. wait for completion marker or idle prompt
5. capture stdout/stderr
6. close process
7. inspect git/test results
8. spawn a fresh process for the next prompt

Strengths:

- more scriptable than tmux
- easier to integrate into Python logic
- suitable for small local controllers

Weaknesses:

- brittle if CLI output changes
- harder to monitor interactively than tmux

### Completion detection strategies

This is the hardest part of CLI/TUI automation.

Prefer, in order:

1. explicit machine-readable completion output from the CLI
2. a final known status line
3. return to idle prompt
4. timeout plus output quiescence

Avoid relying only on:

- vague natural-language phrases
- cursor position
- ANSI-heavy screen scraping

If possible, wrap the agent CLI with your own completion markers.

### Suggested local loop

A robust local loop looks like this:

1. verify repo status
   - stop if unexpected dirty state exists
2. start fresh session
3. send prompt from a template file
4. wait for completion
5. capture transcript to disk
6. run post-run inspection
   - `git status --short`
   - `git log --oneline -1`
   - validation commands
7. generate next prompt
8. start a new session

### Useful prompt template structure

```text
Continue from commit <hash>.

Read first:
- AGENTS.md
- docs/architecture.md
- <relevant plan docs>

Goal:
- <single narrow objective>

Preserve:
- <intentional seams>

Validation:
- <commands>

Known unrelated failures:
- <list>

Deliver:
- summary
- validation results
- commit
```

### Recommended file outputs per run

For each iteration, save:

- `prompts/<task>/<nn>_prompt.md`
- `logs/<task>/<nn>_agent.log`
- `logs/<task>/<nn>_validation.log`
- `state/<task>.json`

That makes the loop resumable.

### Advantages

- fast to set up
- works with an existing local CLI workflow
- minimal infrastructure
- easy to keep fully local

### Risks

- fragile if the CLI UI changes
- poor structure compared with API-first orchestration
- harder to coordinate multiple agents safely
- state persistence must be built manually

### Best practices

- always create a fresh session for a fresh implementation slice
- keep a transcript for every run
- make repo inspection automatic
- treat timeouts as failures, not success
- keep prompts in files, not inline shell strings
- prefer Python controllers over giant shell scripts once logic grows

### tmux starter script

Use this when you want a debuggable local session you can attach to while the agent is working.

```bash
#!/usr/bin/env bash
set -euo pipefail

TASK_NAME="lite-pruning"
SESSION="codex-${TASK_NAME}"
PROMPT_FILE="automation/prompts/${TASK_NAME}.md"
TRANSCRIPT_DIR="automation/logs/${TASK_NAME}"
mkdir -p "${TRANSCRIPT_DIR}"

if tmux has-session -t "${SESSION}" 2>/dev/null; then
  tmux kill-session -t "${SESSION}"
fi

tmux new-session -d -s "${SESSION}" -c "$(pwd)"
tmux send-keys -t "${SESSION}" "codex" C-m
sleep 2

tmux load-buffer "${PROMPT_FILE}"
tmux paste-buffer -t "${SESSION}"
tmux send-keys -t "${SESSION}" C-m

while true; do
  tmux capture-pane -pt "${SESSION}" > "${TRANSCRIPT_DIR}/latest.log"
  if grep -q "validation results" "${TRANSCRIPT_DIR}/latest.log"; then
    break
  fi
  sleep 10
done

git status --short > "${TRANSCRIPT_DIR}/git_status.txt"
git log --oneline -1 > "${TRANSCRIPT_DIR}/last_commit.txt"
pnpm check > "${TRANSCRIPT_DIR}/check.log" 2>&1 || true
pnpm test > "${TRANSCRIPT_DIR}/test.log" 2>&1 || true

tmux kill-session -t "${SESSION}"
```

This script assumes there is some recognizable completion marker in the transcript. If there is not, replace the `grep` check with one of these:

- idle prompt detection
- no new output for N seconds
- a wrapper command that prints a final sentinel line

### pexpect starter script

Use this when you want local automation in Python without managing a visible tmux session.

```python
from pathlib import Path
import pexpect
import subprocess
import time

PROMPT_PATH = Path("automation/prompts/lite_pruning.md")
TRANSCRIPT_PATH = Path("automation/logs/lite_pruning/session.log")
TRANSCRIPT_PATH.parent.mkdir(parents=True, exist_ok=True)

child = pexpect.spawn("codex", encoding="utf-8", timeout=30)
child.logfile = TRANSCRIPT_PATH.open("w")

child.expect([r">", r"Codex", pexpect.TIMEOUT])
child.sendline(PROMPT_PATH.read_text())

completed = False
last_change = time.time()
last_size = 0

while not completed:
    try:
        child.expect([r"validation results", r"commit", pexpect.TIMEOUT], timeout=15)
        completed = True
    except pexpect.TIMEOUT:
        current_size = TRANSCRIPT_PATH.stat().st_size
        if current_size != last_size:
            last_size = current_size
            last_change = time.time()
        elif time.time() - last_change > 60:
            raise TimeoutError("agent output went idle before a completion marker appeared")

child.close()

subprocess.run(["git", "status", "--short"], check=False)
subprocess.run(["pnpm", "check"], check=False)
subprocess.run(["pnpm", "test"], check=False)
```

### CLI/TUI template design notes

Keep these rules in place:

- prompts should live in files so you can audit them
- transcripts should always be persisted
- completion detection should have both a positive signal and a timeout fallback
- repo validation should happen after the agent exits, not by guessing from transcript text
- every new implementation slice should start in a fresh session or fresh process

### Suggested directory layout for local automation

```text
automation/
  prompts/
    lite_pruning_01.md
    lite_pruning_02.md
  logs/
    lite_pruning/
      run_01_agent.log
      run_01_check.log
      run_01_test.log
  state/
    lite_pruning.json
  scripts/
    run_with_tmux.sh
    run_with_pexpect.py
```

## Which one should you choose?

Choose agent orchestration frameworks if:

- you want a durable, scalable automation system
- you have API access to the agent
- you need workflow state, retries, and observability
- you expect multiple agents, branches, or approval steps

Choose CLI/TUI automation if:

- your primary interface is a local Codex CLI
- you want something working quickly
- the workflow is mostly sequential
- you are comfortable with a little operational brittleness

## Practical recommendation

For a single-repo iterative coding workflow:

1. start with a Python controller around CLI/TUI automation
2. enforce strict repo-state capture and prompt templates
3. move to an orchestration framework only when you need:
   - resumability across machines
   - multi-agent branching
   - approval gates
   - external integrations

This usually gives the best cost/complexity tradeoff.

## Implementation checklist

### For orchestration frameworks

- define task spec schema
- define workflow state schema
- implement run launch
- implement completion polling/webhooks
- implement repo inspection
- implement validation execution
- implement next-step generation
- implement stop conditions
- persist all prompts and outputs

### For CLI/TUI tools

- choose `tmux` or `pexpect`
- define prompt templates
- define completion detection strategy
- save transcripts automatically
- inspect repo state after every run
- run validation automatically
- generate the next prompt from repo state
- always start a fresh session for the next slice

## Final guidance

If the goal is reliable autonomous coding, the real problem is not just starting an agent. It is controlling iteration quality.

The critical ingredients are:

- narrow prompts
- fresh sessions
- deterministic repo inspection
- explicit validation
- clear next-step generation

Those matter more than the specific tool you choose.
