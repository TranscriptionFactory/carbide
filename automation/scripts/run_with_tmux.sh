#!/usr/bin/env bash
set -euo pipefail

TASK_NAME=""
PROMPT_FILE=""
CODEX_COMMAND="codex"
POLL_SECONDS=10
IDLE_TIMEOUT_SECONDS=600

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task)
      TASK_NAME="$2"
      shift 2
      ;;
    --prompt-file)
      PROMPT_FILE="$2"
      shift 2
      ;;
    --codex-command)
      CODEX_COMMAND="$2"
      shift 2
      ;;
    --poll-seconds)
      POLL_SECONDS="$2"
      shift 2
      ;;
    --idle-timeout)
      IDLE_TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TASK_NAME" || -z "$PROMPT_FILE" ]]; then
  echo "usage: run_with_tmux.sh --task <task> --prompt-file <path> [--codex-command 'codex']" >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

SESSION="codex-${TASK_NAME}"
RUN_ID="run_$(date +%s)"
TRANSCRIPT_DIR="automation/logs/${TASK_NAME}/${RUN_ID}"
mkdir -p "$TRANSCRIPT_DIR"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
fi

tmux new-session -d -s "$SESSION" -c "$(pwd)"
tmux send-keys -t "$SESSION" "$CODEX_COMMAND" C-m
sleep 2

tmux load-buffer "$PROMPT_FILE"
tmux paste-buffer -t "$SESSION"
tmux send-keys -t "$SESSION" C-m

last_hash=""
last_change_epoch=$(date +%s)

while true; do
  tmux capture-pane -pt "$SESSION" > "$TRANSCRIPT_DIR/agent.log"
  current_hash=$(shasum "$TRANSCRIPT_DIR/agent.log" | awk '{print $1}')
  if [[ "$current_hash" != "$last_hash" ]]; then
    last_hash="$current_hash"
    last_change_epoch=$(date +%s)
  fi

  if grep -Eqi "(validation results|next step|next goal|commit:)" "$TRANSCRIPT_DIR/agent.log"; then
    break
  fi

  now_epoch=$(date +%s)
  if (( now_epoch - last_change_epoch > IDLE_TIMEOUT_SECONDS )); then
    echo "timed out waiting for completion marker" > "$TRANSCRIPT_DIR/timeout.txt"
    break
  fi

  sleep "$POLL_SECONDS"
done

git status --short > "$TRANSCRIPT_DIR/git_status.txt"
git log --oneline -1 > "$TRANSCRIPT_DIR/last_commit.txt"
pnpm check > "$TRANSCRIPT_DIR/check.log" 2>&1 || true
pnpm test > "$TRANSCRIPT_DIR/test.log" 2>&1 || true

tmux kill-session -t "$SESSION"

echo "logs written to $TRANSCRIPT_DIR"
