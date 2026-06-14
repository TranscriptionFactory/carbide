import type { RagCitation } from "$lib/features/rag/domain/rag_types";

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
  citation_map: Map<number, RagCitation>,
): RagCitation[] {
  const resolved: RagCitation[] = [];
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
  citations: RagCitation[],
): Map<number, RagCitation> {
  return new Map(citations.map((c) => [c.index, c]));
}
