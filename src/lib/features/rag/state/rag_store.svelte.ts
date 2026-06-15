import {
  derive_session_title,
  to_session_summary,
} from "$lib/features/rag/domain/rag_session";
import type {
  RagCitation,
  RagMessage,
  RagRole,
  RagScope,
  RagSession,
  RagSessionSummary,
} from "$lib/features/rag/domain/rag_types";

function new_message(
  role: RagRole,
  content: string,
  citations: RagCitation[] = [],
): RagMessage {
  return { id: crypto.randomUUID(), role, content, citations };
}

export class RagStore {
  sessions = $state<RagSession[]>([]);
  active_id = $state<string | null>(null);
  is_loading = $state(false);
  error = $state<string | null>(null);
  provider_id = $state("");
  scope = $state<RagScope>({});
  streaming_id = $state<string | null>(null);
  revision = $state(0);

  readonly active = $derived(
    this.sessions.find((s) => s.id === this.active_id) ?? null,
  );
  readonly messages = $derived(this.active?.messages ?? []);
  readonly summaries: RagSessionSummary[] = $derived(
    this.sessions
      .map(to_session_summary)
      .sort((a, b) => b.updated_at - a.updated_at),
  );

  set_provider(provider_id: string) {
    this.provider_id = provider_id;
    this.patch_active((s) => ({ ...s, provider_id }));
  }

  set_scope(scope: RagScope) {
    this.scope = scope;
    this.patch_active((s) => ({ ...s, scope }));
  }

  add_user_message(content: string): RagMessage {
    const message = new_message("user", content);
    if (this.active_id) {
      this.patch_active((s) =>
        this.touch({ ...s, messages: [...s.messages, message] }),
      );
    } else {
      this.create_session(message);
    }
    return message;
  }

  add_assistant_message(content: string, citations: RagCitation[]): RagMessage {
    const message = new_message("assistant", content, citations);
    this.patch_active((s) =>
      this.touch({ ...s, messages: [...s.messages, message] }),
    );
    return message;
  }

  start_streaming(): string {
    const message = new_message("assistant", "");
    this.patch_active((s) =>
      this.touch({ ...s, messages: [...s.messages, message] }),
    );
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
    this.patch_active((s) => this.touch(s));
  }

  fail_streaming(error: string) {
    const sid = this.streaming_id;
    if (sid) {
      this.patch_active((s) => ({
        ...s,
        messages: s.messages.filter((m) => !(m.id === sid && m.content === "")),
      }));
      this.streaming_id = null;
    }
    this.set_error(error);
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

  start_new_session() {
    this.active_id = null;
    this.error = null;
    this.is_loading = false;
    this.streaming_id = null;
    this.revision += 1;
  }

  switch_session(id: string) {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) return;
    this.active_id = id;
    this.provider_id = session.provider_id;
    this.scope = session.scope;
    this.error = null;
    this.is_loading = false;
    this.streaming_id = null;
    this.revision += 1;
  }

  rename_session(id: string, title: string) {
    const next = title.trim();
    if (next === "") return;
    this.sessions = this.sessions.map((s) =>
      s.id === id ? this.touch({ ...s, title: next }) : s,
    );
  }

  delete_session(id: string) {
    this.sessions = this.sessions.filter((s) => s.id !== id);
    if (this.active_id === id) {
      this.active_id = null;
      this.streaming_id = null;
      this.is_loading = false;
      this.error = null;
    }
    this.revision += 1;
  }

  hydrate(sessions: RagSession[]) {
    this.sessions = sessions;
    this.active_id = null;
    this.streaming_id = null;
    this.is_loading = false;
    this.error = null;
  }

  begin_turn(): number {
    this.revision += 1;
    return this.revision;
  }

  private create_session(first: RagMessage) {
    const now = Date.now();
    const session: RagSession = {
      id: crypto.randomUUID(),
      title: derive_session_title(first.content),
      created_at: now,
      updated_at: now,
      messages: [first],
      provider_id: this.provider_id,
      scope: this.scope,
    };
    this.sessions = [session, ...this.sessions];
    this.active_id = session.id;
  }

  private patch_active(transform: (session: RagSession) => RagSession) {
    const id = this.active_id;
    if (!id) return;
    this.sessions = this.sessions.map((s) => (s.id === id ? transform(s) : s));
  }

  private update_streaming(transform: (message: RagMessage) => RagMessage) {
    const sid = this.streaming_id;
    if (!sid) return;
    this.patch_active((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.id === sid ? transform(m) : m)),
    }));
  }

  private touch(session: RagSession): RagSession {
    return { ...session, updated_at: Date.now() };
  }
}
