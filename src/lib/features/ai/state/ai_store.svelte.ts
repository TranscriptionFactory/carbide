import type { EditorSelectionSnapshot } from "$lib/shared/types/editor";
import type { MarkdownText, NotePath } from "$lib/shared/types/ids";

const DEFAULT_OLLAMA_MODEL = "qwen3:8b";

type AiProvider = "claude" | "codex" | "ollama";
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

export type AiDialogState = {
  open: boolean;
  provider: AiProvider;
  prompt: string;
  context: AiDialogContext | null;
  cli_status: AiCliStatus;
  cli_error: string | null;
  is_executing: boolean;
  result: AiExecutionResult | null;
  ollama_model: string;
};

function initial_state(): AiDialogState {
  return {
    open: false,
    provider: "claude",
    prompt: "",
    context: null,
    cli_status: "idle",
    cli_error: null,
    is_executing: false,
    result: null,
    ollama_model: DEFAULT_OLLAMA_MODEL,
  };
}

export class AiStore {
  dialog = $state<AiDialogState>(initial_state());

  open_dialog(provider: AiProvider, context: AiDialogContext) {
    this.dialog = {
      ...this.dialog,
      open: true,
      provider,
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
    this.dialog.is_executing = true;
    this.dialog.result = null;
  }

  finish_execution(result: AiExecutionResult) {
    this.dialog.is_executing = false;
    this.dialog.result = result;
  }

  clear_result() {
    this.dialog.result = null;
  }
}
