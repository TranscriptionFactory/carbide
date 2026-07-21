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

export function should_autotitle(session: RagSession): boolean {
  return (session.title_source ?? "derived") === "derived";
}

export function sanitize_generated_title(raw: string): string | null {
  const stripped = raw
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
  if (stripped === "") return null;
  if (stripped.includes("\n")) return null;
  if (stripped.length > MAX_TITLE_LENGTH) return null;
  return stripped;
}
