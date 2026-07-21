import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

export type AiTextPart = { type: "text"; text: string };

export type AiImagePart = { type: "image"; media_type: string; data: string };

export type AiMessageContent = string | Array<AiTextPart | AiImagePart>;

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: AiMessageContent;
};

export type AiStreamRequest = {
  provider_config: AiProviderConfig;
  system_prompt: string;
  messages: AiMessage[];
  model?: string;
  vault_path?: string;
  signal?: AbortSignal;
};

export type AiStreamChunk =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "error"; error: string }
  | { type: "done" };
