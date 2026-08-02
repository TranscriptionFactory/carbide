import { MarkdownJoiner } from "$lib/features/ai";
import { match_citation_markers } from "$lib/features/assistant/domain/chat_citations";
import type { AssistantCitation } from "$lib/features/assistant/types/session";
import type { AssistantChatStreamEvent } from "$lib/features/assistant/types/chat_stream";

export class ChatStreamParser {
  private readonly joiner = new MarkdownJoiner();
  private readonly seen = new Set<number>();

  constructor(private readonly citation_map: Map<number, AssistantCitation>) {}

  push(chunk: string): AssistantChatStreamEvent[] {
    return this.emit(this.joiner.process_chunk(chunk));
  }

  flush(): AssistantChatStreamEvent[] {
    return this.emit(this.joiner.flush());
  }

  private emit(text: string): AssistantChatStreamEvent[] {
    if (text === "") return [];
    const events: AssistantChatStreamEvent[] = [{ type: "text", text }];
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
