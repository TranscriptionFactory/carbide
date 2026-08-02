import { create_logger } from "$lib/shared/utils/logger";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AssistantScope } from "$lib/features/assistant/types/session";
import type { AssistantChatStreamEvent } from "$lib/features/assistant/types/chat_stream";
import type { AssistantChatService } from "$lib/features/assistant/application/assistant_chat_service";

const log = create_logger("chat_mcp_bridge");

export type ChatMcpCitation = {
  index: number;
  note_path: string;
  title: string;
};

export type ChatQueryResponse = {
  answer: string;
  citations: ChatMcpCitation[];
  error: string | null;
};

export async function collect_chat_query_response(
  events: AsyncIterable<AssistantChatStreamEvent>,
): Promise<ChatQueryResponse> {
  let answer = "";
  const citations: ChatMcpCitation[] = [];
  let error: string | null = null;

  for await (const event of events) {
    if (event.type === "text") {
      answer += event.text;
    } else if (event.type === "citation") {
      citations.push(event.citation);
    } else if (event.type === "error") {
      error = event.error;
    }
  }

  return { answer, citations, error };
}

export type ChatMcpQueryEvent = {
  id: number;
  question: string;
  folder: string | null;
  tag: string | null;
};

export async function answer_chat_mcp_query(
  rag_service: AssistantChatService,
  provider: AiProviderConfig | null,
  event: ChatMcpQueryEvent,
): Promise<ChatQueryResponse> {
  if (!provider) {
    return { answer: "", citations: [], error: "No AI provider configured" };
  }

  const scope: AssistantScope = {};
  if (event.folder) scope.folders = [event.folder];
  if (event.tag) scope.tags = [event.tag];

  try {
    return await collect_chat_query_response(
      rag_service.query({
        question: event.question,
        provider_config: provider,
        scope,
      }),
    );
  } catch (error) {
    return { answer: "", citations: [], error: String(error) };
  }
}

// I3: the resolver is injected rather than the provider, so the MCP path gets
// the same availability-probed answer as every other surface. The reactor used
// to hold a private copy of the rule and could answer with an uninstalled CLI.
export async function handle_chat_mcp_query(
  rag_service: AssistantChatService,
  resolve_provider: () => Promise<AiProviderConfig | null>,
  event: ChatMcpQueryEvent,
): Promise<void> {
  const provider = await resolve_provider();
  const response = await answer_chat_mcp_query(rag_service, provider, event);
  try {
    await tauri_invoke("rag_query_respond", { id: event.id, response });
  } catch (error) {
    log.error("Failed to return MCP RAG response", { error });
  }
}
