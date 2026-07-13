import { MarkdownJoiner } from "$lib/features/ai";
import { match_citation_markers } from "$lib/features/rag/domain/rag_citations";
import type {
  RagCitation,
  RagStreamEvent,
} from "$lib/features/rag/domain/rag_types";

export class RagStreamParser {
  private readonly joiner = new MarkdownJoiner();
  private readonly seen = new Set<number>();

  constructor(private readonly citation_map: Map<number, RagCitation>) {}

  push(chunk: string): RagStreamEvent[] {
    return this.emit(this.joiner.process_chunk(chunk));
  }

  flush(): RagStreamEvent[] {
    return this.emit(this.joiner.flush());
  }

  private emit(text: string): RagStreamEvent[] {
    if (text === "") return [];
    const events: RagStreamEvent[] = [{ type: "text", text }];
    for (const index of match_citation_markers(text)) {
      if (this.seen.has(index)) continue;
      const citation = this.citation_map.get(index);
      if (!citation) continue;
      this.seen.add(index);
      events.push({ type: "citation", citation });
    }
    return events;
  }
}
