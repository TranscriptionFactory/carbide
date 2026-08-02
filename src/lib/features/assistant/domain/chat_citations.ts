import type { AssistantCitation } from "$lib/features/assistant/types/session";

const CITATION_MARKER = /\[(\d+)\]/g;

export function match_citation_markers(text: string): number[] {
  const indices: number[] = [];
  for (const match of text.matchAll(CITATION_MARKER)) {
    indices.push(Number(match[1]));
  }
  return indices;
}

export function resolve_citations(
  text: string,
  citation_map: Map<number, AssistantCitation>,
): AssistantCitation[] {
  const resolved: AssistantCitation[] = [];
  const seen = new Set<number>();
  for (const index of match_citation_markers(text)) {
    if (seen.has(index)) continue;
    const citation = citation_map.get(index);
    if (!citation) continue;
    seen.add(index);
    resolved.push(citation);
  }
  return resolved;
}

export function build_citation_map(
  citations: AssistantCitation[],
): Map<number, AssistantCitation> {
  return new Map(citations.map((c) => [c.index, c]));
}
