import type { RagScope } from "$lib/features/rag/domain/rag_types";

export type RagTemplateId =
  | "summarize_scope"
  | "extract_action_items"
  | "open_questions"
  | "timeline";

export type RagTemplate = {
  id: RagTemplateId;
  label: string;
  build: (scope: RagScope) => string;
};

function join_human(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function scope_phrase(scope: RagScope): string {
  const parts: string[] = [];
  const folders = scope.folders ?? [];
  const tags = scope.tags ?? [];
  const bases = scope.bases ?? [];

  if (folders.length) {
    const label = folders.map((f) => `"${f.replace(/\/+$/, "")}"`);
    parts.push(`the ${folders.length > 1 ? "folders" : "folder"} ${join_human(label)}`);
  }
  if (tags.length) {
    parts.push(`notes tagged ${join_human(tags.map((t) => `#${t.replace(/^#/, "")}`))}`);
  }
  if (bases.length) {
    parts.push(`the ${join_human(bases.map((b) => `"${b}"`))} view`);
  }

  if (parts.length === 0) return "my vault";
  return join_human(parts);
}

export const RAG_TEMPLATES: RagTemplate[] = [
  {
    id: "summarize_scope",
    label: "Summarize",
    build: (scope) => `Summarize the key points and themes across ${scope_phrase(scope)}.`,
  },
  {
    id: "extract_action_items",
    label: "Action items",
    build: (scope) =>
      `List every action item, todo, and open task mentioned in ${scope_phrase(scope)}, with the note each comes from.`,
  },
  {
    id: "open_questions",
    label: "Open questions",
    build: (scope) =>
      `What open questions or unresolved threads remain in ${scope_phrase(scope)}?`,
  },
  {
    id: "timeline",
    label: "Timeline",
    build: (scope) =>
      `Build a chronological timeline of what I wrote in ${scope_phrase(scope)}.`,
  },
];
