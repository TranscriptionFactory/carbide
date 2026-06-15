import type { RagStreamEvent } from "$lib/features/rag/domain/rag_types";

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
