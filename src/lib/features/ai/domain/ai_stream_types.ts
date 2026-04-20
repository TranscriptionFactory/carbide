import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiStreamRequest = {
  provider_config: AiProviderConfig;
  system_prompt: string;
  messages: AiMessage[];
  model?: string;
};

export type AiStreamChunk =
  | { type: "text"; text: string }
  | { type: "error"; error: string }
  | { type: "done" };
