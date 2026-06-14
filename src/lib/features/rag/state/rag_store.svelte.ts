import type {
  RagCitation,
  RagMessage,
} from "$lib/features/rag/domain/rag_types";

export class RagStore {
  messages = $state<RagMessage[]>([]);
  is_loading = $state(false);
  error = $state<string | null>(null);
  provider_id = $state("");
  streaming_id = $state<string | null>(null);

  set_provider(provider_id: string) {
    this.provider_id = provider_id;
  }

  add_user_message(content: string): RagMessage {
    const message: RagMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      citations: [],
    };
    this.messages = [...this.messages, message];
    return message;
  }

  add_assistant_message(content: string, citations: RagCitation[]): RagMessage {
    const message: RagMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      citations,
    };
    this.messages = [...this.messages, message];
    return message;
  }

  start_streaming(): string {
    const message: RagMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      citations: [],
    };
    this.messages = [...this.messages, message];
    this.streaming_id = message.id;
    this.is_loading = false;
    return message.id;
  }

  append_streaming_text(text: string) {
    this.update_streaming((m) => ({ ...m, content: m.content + text }));
  }

  add_streaming_citation(citation: RagCitation) {
    this.update_streaming((m) =>
      m.citations.some((c) => c.index === citation.index)
        ? m
        : { ...m, citations: [...m.citations, citation] },
    );
  }

  finish_streaming() {
    this.streaming_id = null;
    this.is_loading = false;
  }

  fail_streaming(error: string) {
    if (this.streaming_id) {
      const id = this.streaming_id;
      this.messages = this.messages.filter(
        (m) => !(m.id === id && m.content === ""),
      );
      this.streaming_id = null;
    }
    this.set_error(error);
  }

  private update_streaming(transform: (message: RagMessage) => RagMessage) {
    const id = this.streaming_id;
    if (!id) return;
    this.messages = this.messages.map((m) => (m.id === id ? transform(m) : m));
  }

  start_loading() {
    this.is_loading = true;
    this.error = null;
  }

  finish_loading() {
    this.is_loading = false;
  }

  set_error(error: string | null) {
    this.error = error;
    this.is_loading = false;
  }

  clear() {
    this.messages = [];
    this.error = null;
    this.is_loading = false;
    this.streaming_id = null;
  }
}
