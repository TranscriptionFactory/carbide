import type { EditorSelectionSnapshot } from "$lib/shared/types/editor";
import type { MarkdownText, NotePath } from "$lib/shared/types/ids";

const DEFAULT_OLLAMA_MODEL = "qwen3:8b";

type AiProvider = "claude" | "codex" | "ollama";
type AiMode = "edit" | "ask";
type AiCliStatus = "idle" | "checking" | "available" | "unavailable" | "error";

type AiExecutionResult = {
  success: boolean;
  output: string;
  error: string | null;
};

type AiDialogContext = {
  note_path: NotePath;
  note_title: string;
  note_markdown: MarkdownText;
  selection: EditorSelectionSnapshot | null;
  target: "selection" | "full_note";
};

type AiConversationTurn = {
  id: number;
  provider: AiProvider;
  target: "selection" | "full_note";
  mode: AiMode;
  prompt: string;
  status: "pending" | "completed";
  result: AiExecutionResult | null;
};

export type AiDialogState = {
  open: boolean;
  provider: AiProvider;
  mode: AiMode;
  prompt: string;
  context: AiDialogContext | null;
  cli_status: AiCliStatus;
  cli_error: string | null;
  is_executing: boolean;
  result: AiExecutionResult | null;
  ollama_model: string;
  turns: AiConversationTurn[];
  next_turn_id: number;
};

function initial_state(): AiDialogState {
  return {
    open: false,
    provider: "claude",
    mode: "edit",
    prompt: "",
    context: null,
    cli_status: "idle",
    cli_error: null,
    is_executing: false,
    result: null,
    ollama_model: DEFAULT_OLLAMA_MODEL,
    turns: [],
    next_turn_id: 1,
  };
}

export class AiStore {
  dialog = $state<AiDialogState>(initial_state());

  open_dialog(provider: AiProvider, context: AiDialogContext) {
    this.dialog = {
      ...initial_state(),
      open: true,
      provider,
      ollama_model: this.dialog.ollama_model,
      prompt: "",
      context,
      cli_status: "idle",
      cli_error: null,
      is_executing: false,
      result: null,
    };
  }

  close_dialog() {
    this.dialog = {
      ...initial_state(),
      provider: this.dialog.provider,
      ollama_model: this.dialog.ollama_model,
    };
  }

  set_provider(provider: AiProvider) {
    this.dialog.provider = provider;
    this.dialog.result = null;
    this.dialog.cli_status = "idle";
    this.dialog.cli_error = null;
  }

  set_mode(mode: AiMode) {
    this.dialog.mode = mode;
  }

  update_context(context: AiDialogContext) {
    if (!this.dialog.open || !this.dialog.context) {
      return;
    }

    const next_target =
      context.target === "selection" &&
      (!context.selection || context.selection.text.trim() === "")
        ? "full_note"
        : context.target;

    this.dialog.context = {
      ...context,
      target: next_target,
    };
  }

  set_target(target: "selection" | "full_note") {
    if (!this.dialog.context) {
      return;
    }
    this.dialog.context = {
      ...this.dialog.context,
      target,
    };
    this.dialog.result = null;
  }

  set_prompt(prompt: string) {
    this.dialog.prompt = prompt;
  }

  set_ollama_model(model: string) {
    this.dialog.ollama_model = model;
  }

  set_cli_status(status: AiCliStatus, error: string | null = null) {
    this.dialog.cli_status = status;
    this.dialog.cli_error = error;
  }

  start_execution() {
    if (!this.dialog.context) {
      return;
    }
    this.dialog.is_executing = true;
    this.dialog.result = null;
    this.dialog.turns = [
      ...this.dialog.turns,
      {
        id: this.dialog.next_turn_id,
        provider: this.dialog.provider,
        target: this.dialog.context.target,
        mode: this.dialog.mode,
        prompt: this.dialog.prompt.trim(),
        status: "pending",
        result: null,
      },
    ];
    this.dialog.next_turn_id += 1;
  }

  finish_execution(result: AiExecutionResult) {
    this.dialog.is_executing = false;
    this.dialog.result = result;
    const last_index = this.dialog.turns.length - 1;
    if (last_index < 0) {
      return;
    }
    const turn = this.dialog.turns[last_index];
    if (!turn) {
      return;
    }
    this.dialog.turns[last_index] = {
      ...turn,
      status: "completed",
      result,
    };
  }

  clear_result() {
    this.dialog.result = null;
  }
}
