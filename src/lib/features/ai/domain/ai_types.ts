import type { EditorSelectionSnapshot } from "$lib/shared/types/editor";
import type { MarkdownText, NotePath } from "$lib/shared/types/ids";

export type AiProvider = "claude" | "codex" | "ollama";
export type AiApplyTarget = "selection" | "full_note";
export type AiCliStatus =
  | "idle"
  | "checking"
  | "available"
  | "unavailable"
  | "error";

export type AiExecutionResult = {
  success: boolean;
  output: string;
  error: string | null;
};

export type AiConversationTurn = {
  id: number;
  provider: AiProvider;
  target: AiApplyTarget;
  prompt: string;
  status: "pending" | "completed";
  result: AiExecutionResult | null;
};

export type AiDialogContext = {
  note_path: NotePath;
  note_title: string;
  note_markdown: MarkdownText;
  selection: EditorSelectionSnapshot | null;
  target: AiApplyTarget;
};

export type AiCliCheckRequest = {
  provider: AiProvider;
  command?: string | null;
};

export type AiPortRequest = {
  provider: AiProvider;
  vault_path: string;
  note_path: NotePath;
  prompt: string;
  command?: string | null;
  ollama_model?: string | null;
  timeout_seconds?: number | null;
};

export type AiProviderDisplay = {
  name: string;
  cli_name: string;
  install_url: string;
  command_label: string;
};

export const DEFAULT_OLLAMA_MODEL = "qwen3:8b";

export const AI_PROVIDER_DISPLAY: Record<AiProvider, AiProviderDisplay> = {
  claude: {
    name: "Claude",
    cli_name: "Claude Code CLI",
    install_url: "https://code.claude.com/docs/en/quickstart",
    command_label: "Claude Backend",
  },
  codex: {
    name: "Codex",
    cli_name: "OpenAI Codex CLI",
    install_url: "https://github.com/openai/codex",
    command_label: "Codex Backend",
  },
  ollama: {
    name: "Ollama",
    cli_name: "Ollama CLI",
    install_url: "https://ollama.com",
    command_label: "Ollama Backend",
  },
};
