import type {
  RagSession,
  RagSessionSummary,
} from "$lib/features/rag/types/rag_types";

const MAX_TITLE_LENGTH = 60;

export function to_session_summary(session: RagSession): RagSessionSummary {
  return {
    id: session.id,
    title: session.title,
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
}

export function derive_session_title(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (trimmed === "") return "New chat";
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE_LENGTH).trimEnd()}…`;
}
