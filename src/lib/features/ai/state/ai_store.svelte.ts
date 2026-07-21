import type { EditorSelectionSnapshot } from "$lib/shared/types/editor";
import type { MarkdownText, NotePath } from "$lib/shared/types/ids";

type AiMode = "edit" | "ask";
type AiApplyTarget = "selection" | "full_note";
type AiCliStatus =
  | "idle"
  | "checking"
  | "available"
  | "unavailable"
  | "unknown"
  | "error";

type AiExecutionResult = {
  success: boolean;
  output: string;
  error: string | null;
};

type AiDialogNoteContext = {
  kind: "note";
  note_path: NotePath;
  note_title: string;
  note_markdown: MarkdownText;
  selection: EditorSelectionSnapshot | null;
  target: AiApplyTarget;
};

type AiDialogDocumentContext = {
  kind: "document";
  tab_id: string;
  file_path: string;
  file_title: string;
  content: string;
  target: "full_note";
};

type AiDialogContext = AiDialogNoteContext | AiDialogDocumentContext;

type AiConversationTurn = {
  id: number;
  provider_id: string;
  target: AiApplyTarget;
  mode: AiMode;
  prompt: string;
  status: "pending" | "completed";
  result: AiExecutionResult | null;
  reasoning?: string;
};

export type AiDialogState = {
  open: boolean;
  provider_id: string;
  mode: AiMode;
  prompt: string;
  context: AiDialogContext | null;
  cli_status: AiCliStatus;
  cli_error: string | null;
  is_executing: boolean;
  streaming_text: string | null;
  streaming_reasoning: string | null;
  result: AiExecutionResult | null;
  turns: AiConversationTurn[];
  next_turn_id: number;
  vault_context_enabled: boolean;
};

function initial_state(): AiDialogState {
  return {
    open: false,
    provider_id: "claude",
    mode: "edit",
    prompt: "",
    context: null,
    cli_status: "idle",
    cli_error: null,
    is_executing: false,
    streaming_text: null,
    streaming_reasoning: null,
    result: null,
    turns: [],
    next_turn_id: 1,
    vault_context_enabled: true,
  };
}

export class AiStore {
  dialog = $state<AiDialogState>(initial_state());

  open_dialog(
    provider_id: string,
    context: AiDialogContext,
    options?: { vault_context_enabled?: boolean },
  ) {
    const defaults = initial_state();
    this.dialog = {
      ...defaults,
      open: true,
      provider_id,
      prompt: "",
      context,
      cli_status: "idle",
      cli_error: null,
      is_executing: false,
      result: null,
      turns: this.settled_turns(),
      next_turn_id: this.dialog.next_turn_id,
      vault_context_enabled:
        options?.vault_context_enabled ?? defaults.vault_context_enabled,
    };
  }

  close_dialog() {
    this.dialog = {
      ...initial_state(),
      provider_id: this.dialog.provider_id,
      turns: this.settled_turns(),
      next_turn_id: this.dialog.next_turn_id,
    };
  }

  private settled_turns() {
    return this.dialog.turns.filter((t) => t.status === "completed");
  }

  hydrate_turns(turns: AiConversationTurn[]) {
    const pending = this.dialog.turns.filter((t) => t.status === "pending");
    let next_id = Math.max(0, ...turns.map((t) => t.id)) + 1;
    this.dialog.turns = [
      ...turns,
      ...pending.map((t) => ({ ...t, id: next_id++ })),
    ];
    this.dialog.next_turn_id = next_id;
  }

  clear_turns() {
    this.dialog.turns = [];
    this.dialog.next_turn_id = 1;
  }

  set_provider(provider_id: string) {
    this.dialog.provider_id = provider_id;
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

    if (context.kind === "document") {
      this.dialog.context = context;
      return;
    }

    const tgt_is_sel = context.target === "selection";
    const sel = context.selection;
    const sel_empty = !sel || sel.text.trim() === "";
    const next_target = tgt_is_sel && sel_empty ? "full_note" : context.target;

    this.dialog.context = {
      ...context,
      target: next_target,
    };
  }

  set_target(target: AiApplyTarget) {
    const current = this.dialog.context;
    if (!current || current.kind !== "note") {
      return;
    }
    this.dialog.context = {
      ...current,
      target,
    };
    this.dialog.result = null;
  }

  set_prompt(prompt: string) {
    this.dialog.prompt = prompt;
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
    this.dialog.streaming_text = null;
    this.dialog.streaming_reasoning = null;
    this.dialog.result = null;
    this.dialog.turns = [
      ...this.dialog.turns,
      {
        id: this.dialog.next_turn_id,
        provider_id: this.dialog.provider_id,
        target: this.dialog.context.target,
        mode: this.dialog.mode,
        prompt: this.dialog.prompt.trim(),
        status: "pending",
        result: null,
      },
    ];
    this.dialog.next_turn_id += 1;
  }

  set_streaming_text(text: string) {
    if (!this.dialog.is_executing) {
      return;
    }
    this.dialog.streaming_text = text;
  }

  set_streaming_reasoning(text: string) {
    if (!this.dialog.is_executing) {
      return;
    }
    this.dialog.streaming_reasoning = text;
  }

  cancel_execution() {
    this.dialog.is_executing = false;
    this.dialog.streaming_text = null;
    this.dialog.streaming_reasoning = null;
    const last = this.dialog.turns.at(-1);
    if (last?.status === "pending") {
      this.dialog.turns = this.dialog.turns.slice(0, -1);
    }
  }

  finish_execution(result: AiExecutionResult) {
    const reasoning = this.dialog.streaming_reasoning;
    this.dialog.is_executing = false;
    this.dialog.streaming_text = null;
    this.dialog.streaming_reasoning = null;
    this.dialog.result = result;
    const last_index = this.dialog.turns.length - 1;
    const turn = this.dialog.turns[last_index];
    if (!turn || turn.status !== "pending") {
      return;
    }
    this.dialog.turns[last_index] = {
      ...turn,
      status: "completed",
      result,
      ...(reasoning ? { reasoning } : {}),
    };
  }

  clear_result() {
    this.dialog.result = null;
  }
}
