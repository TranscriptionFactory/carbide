from __future__ import annotations

import argparse
import subprocess
import time
from pathlib import Path

import pexpect


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt-file", required=True)
    parser.add_argument("--task", required=True)
    parser.add_argument("--codex-command", default="codex")
    parser.add_argument("--idle-timeout", type=int, default=600)
    parser.add_argument("--expect-timeout", type=int, default=30)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    prompt_path = Path(args.prompt_file)
    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt file not found: {prompt_path}")

    run_dir = Path("automation/logs") / args.task / f"run_{int(time.time())}"
    run_dir.mkdir(parents=True, exist_ok=True)
    transcript_path = run_dir / "agent.log"

    child = pexpect.spawn(args.codex_command, encoding="utf-8", timeout=args.expect_timeout)
    with transcript_path.open("w") as transcript:
        child.logfile = transcript

        try:
            child.expect([r">", r"Codex", pexpect.TIMEOUT])
        except pexpect.TIMEOUT:
            pass

        child.sendline(prompt_path.read_text())

        completed = False
        last_change = time.time()
        last_size = 0

        while not completed:
            try:
                child.expect(
                    [r"validation results", r"next step", r"next goal", r"commit", pexpect.TIMEOUT],
                    timeout=15,
                )
                completed = True
            except pexpect.TIMEOUT:
                current_size = transcript_path.stat().st_size
                if current_size != last_size:
                    last_size = current_size
                    last_change = time.time()
                elif time.time() - last_change > args.idle_timeout:
                    (run_dir / "timeout.txt").write_text(
                        "agent output went idle before a completion marker appeared\n"
                    )
                    break

        child.close(force=True)

    for name, command in (
        ("git_status.txt", ["git", "status", "--short"]),
        ("last_commit.txt", ["git", "log", "--oneline", "-1"]),
        ("check.log", ["pnpm", "check"]),
        ("test.log", ["pnpm", "test"]),
    ):
        output_path = run_dir / name
        with output_path.open("w") as handle:
            subprocess.run(command, stdout=handle, stderr=subprocess.STDOUT, check=False)

    print(f"logs written to {run_dir}")


if __name__ == "__main__":
    main()
