import type { EditorSelectionSnapshot } from "$lib/shared/types/editor";
import type { MarkdownText, NotePath } from "$lib/shared/types/ids";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

export type {
  AiTransport,
  AiCliTransport,
  AiApiTransport,
  AiProviderConfig,
} from "$lib/shared/types/ai_provider_config";
export { BUILTIN_PROVIDER_PRESETS } from "$lib/shared/types/ai_provider_config";

export type AiProviderId = string;
export type AiApplyTarget = "selection" | "full_note";
export type AiMode = "edit" | "ask";
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
  provider_id: AiProviderId;
  target: AiApplyTarget;
  mode: AiMode;
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
  command: string;
};

export type AiPortExecuteRequest = {
  provider_config: AiProviderConfig;
  vault_path: string;
  note_path: NotePath;
  prompt: string;
  timeout_seconds?: number | null;
};

export function find_provider(
  providers: AiProviderConfig[],
  id: string,
): AiProviderConfig | undefined {
  return providers.find((p) => p.id === id);
}

export function provider_command(config: AiProviderConfig): string | null {
  return config.transport.kind === "cli" ? config.transport.command : null;
}
