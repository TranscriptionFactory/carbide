import type { AssistantMessage } from "$lib/features/assistant/types/session";

export type AgentHistoryToolCall = {
  id: string;
  name: string;
  arguments: string;
};

// The replay shape an agent turn sends back to the provider. Declared here
// rather than reusing the text channel's AiMessage, which has no "tool" role
// and so cannot express a replayed tool call at all. Kept distinct from
// AssistantToolCall on purpose: this one mirrors the wire, that one is the
// session model, and they coincide today only by accident.
export type AgentHistoryMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: AgentHistoryToolCall[];
  tool_call_id?: string;
};

const MAX_REPLAY_MESSAGES = 40;

function to_history_message(message: AssistantMessage): AgentHistoryMessage {
  const mapped: AgentHistoryMessage = {
    role: message.role,
    content: message.content,
  };
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

function drop_orphan_tool_prefix(
  messages: AgentHistoryMessage[],
): AgentHistoryMessage[] {
  let start = 0;
  while (messages[start]?.role === "tool") start += 1;
  return messages.slice(start);
}

export function session_messages_to_history(
  messages: AssistantMessage[],
): AgentHistoryMessage[] {
  const mapped = messages.map(to_history_message);
  return drop_orphan_tool_prefix(mapped.slice(-MAX_REPLAY_MESSAGES));
}
