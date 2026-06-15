const MAX_TITLE_LENGTH = 60;

export function derive_session_title(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (trimmed === "") return "New chat";
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE_LENGTH).trimEnd()}…`;
}
