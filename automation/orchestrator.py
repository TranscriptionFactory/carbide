from __future__ import annotations

import argparse
import json
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

DEFAULT_VALIDATION_COMMANDS = (
    ("check", ["pnpm", "check"]),
    ("lint", ["pnpm", "lint"]),
    ("test", ["pnpm", "test"]),
)


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
    def __init__(self, log_dir: Path):
        self.log_dir = log_dir

    def run(self) -> dict[str, int]:
        results: dict[str, int] = {}
        for name, command in DEFAULT_VALIDATION_COMMANDS:
            log_path = self.log_dir / f"{name}.log"
            with log_path.open("w") as handle:
                proc = subprocess.run(command, stdout=handle, stderr=subprocess.STDOUT)
            results[name] = proc.returncode
        return results


class AgentRunner:
    def __init__(self, codex_command: list[str], run_log_path: Path):
        self.codex_command = codex_command
        self.run_log_path = run_log_path

    def start_run(self, prompt_text: str) -> None:
        with self.run_log_path.open("w") as log_file:
            subprocess.run(
                [*self.codex_command, prompt_text],
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
            )


class NextStepGenerator:
    def build(self, validation: dict[str, int]) -> str:
        if validation.get("check"):
            return "fix the typecheck regression introduced in the last slice"
        if validation.get("test"):
            return "inspect whether the failing tests are newly introduced or known unrelated failures"
        return "define the next narrow implementation slice"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--prompt-file", required=True)
    parser.add_argument("--codex-command", default="codex exec")
    parser.add_argument(
        "--state-file",
        default=None,
        help="Optional explicit state file path. Defaults to automation/state/<task_id>.json",
    )
    return parser.parse_args()


def load_state(state_path: Path, task_id: str) -> WorkflowState:
    if state_path.exists():
        return WorkflowState(**json.loads(state_path.read_text()))
    branch = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
    base_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    return WorkflowState(
        task_id=task_id,
        iteration=1,
        branch=branch,
        base_commit=base_commit,
        last_commit=None,
        last_prompt_path=None,
        last_run_status=None,
        next_goal="define the next narrow implementation slice",
    )


def save_state(state_path: Path, state: WorkflowState) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(asdict(state), indent=2))


def save_snapshot(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2))


def main() -> None:
    args = parse_args()
    prompt_path = Path(args.prompt_file)
    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt file not found: {prompt_path}")

    state_path = (
        Path(args.state_file)
        if args.state_file
        else Path("automation/state") / f"{args.task_id}.json"
    )
    log_dir = Path("automation/logs") / args.task_id / f"run_{int(time.time())}"
    log_dir.mkdir(parents=True, exist_ok=True)

    state = load_state(state_path, args.task_id)
    repo_inspector = RepoInspector()
    validator = Validator(log_dir)
    next_step = NextStepGenerator()
    runner = AgentRunner(args.codex_command.split(), log_dir / "agent.log")

    prompt_text = prompt_path.read_text()
    repo_before = repo_inspector.snapshot()
    save_snapshot(log_dir / "repo_before.json", repo_before)

    runner.start_run(prompt_text)

    validation = validator.run()
    save_snapshot(log_dir / "validation.json", validation)
    repo_after = repo_inspector.snapshot()
    save_snapshot(log_dir / "repo_after.json", repo_after)

    state.iteration += 1
    state.last_commit = repo_after["head"]
    state.last_prompt_path = str(prompt_path)
    state.last_run_status = "completed"
    state.next_goal = next_step.build(validation)
    save_state(state_path, state)

    print(f"agent log: {log_dir / 'agent.log'}")
    print(f"validation: {log_dir / 'validation.json'}")
    print(f"next goal: {state.next_goal}")


if __name__ == "__main__":
    main()
