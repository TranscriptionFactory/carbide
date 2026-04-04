# Automation Starters

This directory contains starter assets for iterative Codex-style automation.

## Files

- `orchestrator.py`
  - Python orchestration starter for prompt -> run -> validate -> next-step loops
- `scripts/run_with_tmux.sh`
  - starts a fresh tmux session, feeds a prompt file, captures a transcript, then runs repo inspection
- `scripts/run_with_pexpect.py`
  - drives a Codex CLI process directly with `pexpect`
- `prompts/`
  - prompt files for each run
- `logs/`
  - transcripts and validation logs
- `state/`
  - workflow state JSON

## Suggested workflow

1. create a prompt in `automation/prompts/`
2. choose one runner:
   - `python3 automation/orchestrator.py --prompt-file ...`
   - `automation/scripts/run_with_tmux.sh ...`
   - `python3 automation/scripts/run_with_pexpect.py ...`
3. inspect logs under `automation/logs/`
4. review git status, diffs, and validation outputs
5. create the next prompt and start a fresh run

## Notes

- These are starter utilities, not production-hardened automation.
- They assume a `codex` CLI is installed and available on `PATH`.
- Completion detection is intentionally conservative and should be adapted to your local Codex CLI behavior.
- The scripts do not auto-commit or auto-push.
- Preserve repo-specific constraints in your prompt files.

## Examples

Run the orchestrator:

```bash
python3 automation/orchestrator.py \
  --task-id lite-pruning \
  --prompt-file automation/prompts/lite_pruning_01.md
```

Run with tmux:

```bash
automation/scripts/run_with_tmux.sh \
  --task lite-pruning \
  --prompt-file automation/prompts/lite_pruning_01.md
```

Run with pexpect:

```bash
python3 automation/scripts/run_with_pexpect.py \
  --prompt-file automation/prompts/lite_pruning_01.md \
  --task lite-pruning
```
