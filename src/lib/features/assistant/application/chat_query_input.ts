import {
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
} from "$lib/shared/types/editor_settings";
import type { AiImagePart } from "$lib/features/ai";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { RunHandle } from "$lib/features/assistant/types/run";
import type {
  AssistantMessage,
  AssistantScope,
} from "$lib/features/assistant/types/session";
import type { AssistantChatQueryInput } from "$lib/features/assistant/application/assistant_chat_service";

const RETRIEVE_LIMIT_MIN = 1;
const RETRIEVE_LIMIT_MAX = 50;
const TOKEN_BUDGET_MIN = 1000;
const TOKEN_BUDGET_MAX = 128000;

function clamp_setting(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export type ChatQueryInputRequest = {
  question: string;
  provider_config: AiProviderConfig;
  settings: EditorSettings;
  scope?: AssistantScope;
  history?: AssistantMessage[];
  image_parts?: AiImagePart[];
  attachment?: { path: string; title: string; content: string };
  on_run_started?: (handle: RunHandle) => void;
};

// Every surface that asks the vault a question builds its input here, so the
// two retrieval settings cannot apply to one surface and not another. The MCP
// bridge used to construct its own input and passed neither, which was
// invisible only because both settings default to the same values retrieval
// and the assembler fall back to (15 notes, 8000 tokens) — move either slider
// and the same question answered differently in-app and over MCP.
export function build_chat_query_input(
  request: ChatQueryInputRequest,
): AssistantChatQueryInput {
  const { settings } = request;
  return {
    question: request.question,
    provider_config: request.provider_config,
    retrieve_limit: clamp_setting(
      settings.ai_rag_retrieve_limit,
      RETRIEVE_LIMIT_MIN,
      RETRIEVE_LIMIT_MAX,
      DEFAULT_EDITOR_SETTINGS.ai_rag_retrieve_limit,
    ),
    assembler_options: {
      token_budget: clamp_setting(
        settings.ai_rag_context_token_budget,
        TOKEN_BUDGET_MIN,
        TOKEN_BUDGET_MAX,
        DEFAULT_EDITOR_SETTINGS.ai_rag_context_token_budget,
      ),
    },
    ...(request.scope ? { scope: request.scope } : {}),
    ...(request.history ? { history: request.history } : {}),
    ...(request.image_parts ? { image_parts: request.image_parts } : {}),
    ...(request.attachment ? { attachment: request.attachment } : {}),
    ...(request.on_run_started
      ? { on_run_started: request.on_run_started }
      : {}),
  };
}
