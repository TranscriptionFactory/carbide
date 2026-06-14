import type {
  RagCitation,
  RagMessage,
} from "$lib/features/rag/domain/rag_types";

export class RagStore {
  messages = $state<RagMessage[]>([]);
  is_loading = $state(false);
  error = $state<string | null>(null);
  provider_id = $state("");

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
  }
}
