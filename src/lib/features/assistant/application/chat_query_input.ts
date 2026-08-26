import {
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
} from "$lib/shared/types/editor_settings";
import type { AiImagePart } from "$lib/features/ai";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { RunHandle } from "$lib/features/assistant/types/run";
import type { ResolvedAttachment } from "$lib/features/assistant/types/attachment";
import type {
  AssistantMessage,
  AssistantScope,
} from "$lib/features/assistant/types/session";
import type { AssistantChatQueryInput } from "$lib/features/assistant/application/assistant_chat_service";

const RETRIEVE_LIMIT_MIN = 1;
const RETRIEVE_LIMIT_MAX = 50;
const TOKEN_BUDGET_MIN = 1000;
const TOKEN_BUDGET_MAX = 128000;
// Automatic sizing spends CONTEXT_WINDOW_FRACTION of the provider's declared
// context window on retrieved note context, and holds RESERVE_TOKEN_FRACTION of
// that budget back for the question, the chat history and the answer itself.
// Neither fraction has a recorded derivation: no cost, latency or
// lost-in-the-middle measurement backs 0.3 or 0.25 anywhere in this repo. They
// are conservative starting points, and evidence should move them.
//
// The ceiling is a backstop against a provider declaring an enormous window --
// a 1M-token model would otherwise claim a 300k-token context budget -- and not
// a second budget dial. The four ACP presets -- claude, codex, opencode and pi
// -- declare a 200k window (ai_provider_config.ts); ollama declares none and
// takes UNKNOWN_CONTEXT_TOKEN_BUDGET instead, so it is untouched by any of this.
// For the four that do declare one, 0.3 of 200k is 60000, and that has to clear
// the ceiling for the fraction to be the sole arbiter of the budget; a ceiling
// under it clips all four and silently governs in the fraction's place, which is
// two knobs deciding one number with the tighter one winning invisibly. At 64000
// the ceiling engages only past a ~213k declared window. The floor covers the
// opposite end, where a small declared window would leave too little room to
// answer from.
const DERIVED_TOKEN_BUDGET_FLOOR = 8000;
const DERIVED_TOKEN_BUDGET_CEILING = 64000;
const CONTEXT_WINDOW_FRACTION = 0.3;
const RESERVE_TOKEN_FRACTION = 0.25;
const HISTORY_BUDGET_MIN = 0;
const HISTORY_BUDGET_MAX = 32000;
const UNKNOWN_CONTEXT_TOKEN_BUDGET = 8000;

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
  attachment?: ResolvedAttachment;
  session_id?: string;
  on_run_started?: (handle: RunHandle) => void;
};

function context_token_budget(
  provider: AiProviderConfig,
  configured: number | undefined,
): number {
  if (configured !== undefined && Number.isFinite(configured)) {
    return clamp_setting(
      configured,
      TOKEN_BUDGET_MIN,
      TOKEN_BUDGET_MAX,
      UNKNOWN_CONTEXT_TOKEN_BUDGET,
    );
  }
  const context_window = provider.context_window_tokens;
  if (context_window === undefined || !Number.isFinite(context_window)) {
    return UNKNOWN_CONTEXT_TOKEN_BUDGET;
  }
  return clamp_setting(
    context_window * CONTEXT_WINDOW_FRACTION,
    DERIVED_TOKEN_BUDGET_FLOOR,
    DERIVED_TOKEN_BUDGET_CEILING,
    UNKNOWN_CONTEXT_TOKEN_BUDGET,
  );
}

// Every surface that asks the vault a question builds its input here, so the
// retrieval settings cannot apply to one surface and not another. The MCP
// bridge used to construct its own input and passed neither, which was
// invisible only because the settings matched the downstream fallbacks.
export function build_chat_query_input(
  request: ChatQueryInputRequest,
): AssistantChatQueryInput {
  const { settings } = request;
  const token_budget = context_token_budget(
    request.provider_config,
    settings.ai_rag_context_token_budget,
  );
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
      token_budget,
      reserve_tokens: Math.round(token_budget * RESERVE_TOKEN_FRACTION),
    },
    history_token_budget: clamp_setting(
      settings.ai_rag_history_token_budget,
      HISTORY_BUDGET_MIN,
      HISTORY_BUDGET_MAX,
      DEFAULT_EDITOR_SETTINGS.ai_rag_history_token_budget,
    ),
    ...(request.scope ? { scope: request.scope } : {}),
    ...(request.history ? { history: request.history } : {}),
    ...(request.image_parts ? { image_parts: request.image_parts } : {}),
    ...(request.attachment ? { attachment: request.attachment } : {}),
    ...(request.session_id ? { session_id: request.session_id } : {}),
    ...(request.on_run_started
      ? { on_run_started: request.on_run_started }
      : {}),
  };
}
