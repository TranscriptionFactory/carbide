import { create_logger } from "$lib/shared/utils/logger";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type {
  RagScope,
  RagStreamEvent,
} from "$lib/features/rag/domain/rag_types";
import type { RagService } from "$lib/features/rag/application/rag_service";

const log = create_logger("rag_mcp_bridge");

export type RagMcpCitation = {
  index: number;
  note_path: string;
  title: string;
};

export type RagQueryResponse = {
  answer: string;
  citations: RagMcpCitation[];
  error: string | null;
};

export async function collect_rag_query_response(
  events: AsyncIterable<RagStreamEvent>,
): Promise<RagQueryResponse> {
  let answer = "";
  const citations: RagMcpCitation[] = [];
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

export type RagMcpQueryEvent = {
  id: number;
  question: string;
  folder: string | null;
  tag: string | null;
};

export async function answer_rag_mcp_query(
  rag_service: RagService,
  provider: AiProviderConfig | null,
  event: RagMcpQueryEvent,
): Promise<RagQueryResponse> {
  if (!provider) {
    return { answer: "", citations: [], error: "No AI provider configured" };
  }

  const scope: RagScope = {};
  if (event.folder) scope.folders = [event.folder];
  if (event.tag) scope.tags = [event.tag];

  try {
    return await collect_rag_query_response(
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

export async function handle_rag_mcp_query(
  rag_service: RagService,
  provider: AiProviderConfig | null,
  event: RagMcpQueryEvent,
): Promise<void> {
  const response = await answer_rag_mcp_query(rag_service, provider, event);
  try {
    await tauri_invoke("rag_query_respond", { id: event.id, response });
  } catch (error) {
    log.error("Failed to return MCP RAG response", { error });
  }
}
