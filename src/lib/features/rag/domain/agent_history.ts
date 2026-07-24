import type { RagMessage } from "$lib/features/rag/domain/rag_types";

export type AiToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: AiToolCall[];
  tool_call_id?: string;
};

const MAX_REPLAY_MESSAGES = 40;

function to_ai_message(message: RagMessage): AiMessage {
  const mapped: AiMessage = { role: message.role, content: message.content };
  if (message.role === "assistant" && message.tool_calls?.length) {
    mapped.tool_calls = message.tool_calls.map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    }));
  }
  if (message.role === "tool" && message.tool_call_id) {
    mapped.tool_call_id = message.tool_call_id;
  }
  return mapped;
}

function drop_orphan_tool_prefix(messages: AiMessage[]): AiMessage[] {
  let start = 0;
  while (messages[start]?.role === "tool") start += 1;
  return messages.slice(start);
}

export function rag_messages_to_history(messages: RagMessage[]): AiMessage[] {
  const mapped = messages.map(to_ai_message);
  return drop_orphan_tool_prefix(mapped.slice(-MAX_REPLAY_MESSAGES));
}
