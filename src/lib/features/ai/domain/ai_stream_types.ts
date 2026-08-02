export type AiTextPart = { type: "text"; text: string };

export type AiImagePart = { type: "image"; media_type: string; data: string };

export type AiMessageContent = string | Array<AiTextPart | AiImagePart>;

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: AiMessageContent;
};

export type AiStreamChunk =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "error"; error: string }
  | { type: "done" };
