import { derive_session_title } from "$lib/features/assistant/types/assistant_session_model";
import {
  to_assistant_session_summary,
  type AssistantChatMode,
  type AssistantCitation,
  type AssistantContextStats,
  type AssistantMessage,
  type AssistantPermissionMode,
  type AssistantRole,
  type AssistantScope,
  type AssistantSession,
  type AssistantSessionSummary,
  type AssistantTitleSource,
  type AssistantToolEvent,
} from "$lib/features/assistant/types/session";
import type {
  AssistantSessionPatch,
  AssistantSessionStore,
} from "$lib/features/assistant/state/assistant_session_store.svelte";
import type { AssistantChatSourceInfo } from "$lib/features/assistant/types/chat_stream";
import type { RetrievalReadiness } from "$lib/features/assistant/types/retrieval";

const CHAT_KIND = "chat";

function new_message(
  role: AssistantRole,
  content: string,
  citations: AssistantCitation[] = [],
): AssistantMessage {
  return { id: crypto.randomUUID(), role, content, citations };
}

// A turn that ran tools or reasoned before failing is worth keeping even with no
// text: the trail is the only record of what the agent touched.
function has_turn_evidence(message: AssistantMessage): boolean {
  return (
    message.content !== "" ||
    (message.tool_events?.length ?? 0) > 0 ||
    (message.reasoning ?? "") !== ""
  );
}

// I4: sessions live in the assistant store, which is the single source for
// every conversational surface. What stays here is the chat panel's own view
// state — which session is open, what is streaming into it, and the working
// copies of provider, scope and mode the composer edits before a session
// exists to hold them.
export class AssistantChatStore {
  active_id = $state<string | null>(null);
  is_loading = $state(false);
  loading_stage = $state<"searching" | "generating">("searching");
  error = $state<string | null>(null);
  provider_id = $state("");
  scope = $state<AssistantScope>({});
  streaming_id = $state<string | null>(null);
  pending_sources = $state<AssistantChatSourceInfo[] | null>(null);
  mode = $state<AssistantChatMode>("ask");
  permission_mode = $state<AssistantPermissionMode>("safe");
  agent_running_tool = $state<string | null>(null);
  revision = $state(0);
  readiness = $state<RetrievalReadiness>({ state: "checking" });

  constructor(private readonly store: AssistantSessionStore) {}

  // Getters rather than $derived: a class field initializer would run before
  // the injected store is assigned.
  get sessions(): AssistantSession[] {
    return this.store.of_kind(CHAT_KIND);
  }

  get active(): AssistantSession | null {
    return this.sessions.find((s) => s.id === this.active_id) ?? null;
  }

  get messages(): AssistantMessage[] {
    return this.active?.messages ?? [];
  }

  get summaries(): AssistantSessionSummary[] {
    return this.sessions
      .map(to_assistant_session_summary)
      .sort((a, b) => b.updated_at - a.updated_at);
  }

  set_provider(provider_id: string) {
    this.provider_id = provider_id;
    this.patch_active({ provider_id });
  }

  set_scope(scope: AssistantScope) {
    this.scope = scope;
    this.patch_active({ scope });
  }

  set_readiness(readiness: RetrievalReadiness) {
    this.readiness = readiness;
  }

  set_mode(mode: AssistantChatMode) {
    this.mode = mode;
    this.patch_active({ mode });
  }

  set_permission_mode(permission_mode: AssistantPermissionMode) {
    this.permission_mode = permission_mode;
    this.patch_active({ permission_mode });
  }

  set_agent_session_id(agent_session_id: string) {
    this.patch_active({ agent_session_id });
  }

  add_changed_files(paths: string[]) {
    const session = this.active;
    if (!session) return;
    this.patch_active({
      changed_files: [
        ...session.changed_files,
        ...paths.filter((p) => !session.changed_files.includes(p)),
      ],
    });
  }

  add_streaming_tool_event(event: AssistantToolEvent) {
    this.agent_running_tool = event.name;
    this.update_streaming((m) => ({
      tool_events: [...(m.tool_events ?? []), event],
    }));
  }

  finish_streaming_tool_event(name: string, ok: boolean) {
    this.agent_running_tool = null;
    this.update_streaming((m) => {
      const events = [...(m.tool_events ?? [])];
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const current = events[i];
        if (current && current.name === name && current.ok === undefined) {
          events[i] = { ...current, ok };
          break;
        }
      }
      return { tool_events: events };
    });
  }

  add_user_message(content: string): AssistantMessage {
    const message = new_message("user", content);
    const id = this.active_id ?? this.create_session(content);
    this.store.append_message(id, message);
    return message;
  }

  add_assistant_message(
    content: string,
    citations: AssistantCitation[],
  ): AssistantMessage {
    const message = new_message("assistant", content, citations);
    if (this.active_id) this.store.append_message(this.active_id, message);
    return message;
  }

  start_streaming(): string {
    const message = new_message("assistant", "");
    if (this.active_id) this.store.append_message(this.active_id, message);
    this.streaming_id = message.id;
    this.is_loading = false;
    return message.id;
  }

  append_streaming_text(text: string) {
    this.update_streaming((m) => ({ content: m.content + text }));
  }

  append_streaming_reasoning(text: string) {
    this.update_streaming((m) => ({ reasoning: (m.reasoning ?? "") + text }));
  }

  set_streaming_context_stats(stats: AssistantContextStats) {
    this.update_streaming(() => ({ context_stats: stats }));
  }

  set_pending_sources(sources: AssistantChatSourceInfo[]) {
    this.pending_sources = sources;
  }

  add_streaming_citation(citation: AssistantCitation) {
    this.update_streaming((m) =>
      m.citations.some((c) => c.index === citation.index)
        ? {}
        : { citations: [...m.citations, citation] },
    );
  }

  finish_streaming() {
    this.streaming_id = null;
    this.is_loading = false;
    this.pending_sources = null;
    this.agent_running_tool = null;
  }

  fail_streaming(error: string) {
    const session_id = this.active_id;
    const sid = this.streaming_id;
    if (session_id && sid) {
      const partial = this.messages.find((m) => m.id === sid);
      if (partial && has_turn_evidence(partial)) {
        // keep the partial turn and record why it failed, so the trail survives
        // persistence; the transient error banner renders beneath it
        this.store.update_message(session_id, sid, { error });
      } else {
        this.store.replace_messages(
          session_id,
          this.messages.filter((m) => m.id !== sid),
        );
      }
      this.streaming_id = null;
    }
    this.pending_sources = null;
    this.agent_running_tool = null;
    this.set_error(error);
  }

  start_loading() {
    this.is_loading = true;
    this.loading_stage = "searching";
    this.error = null;
  }

  set_loading_stage(stage: "searching" | "generating") {
    this.loading_stage = stage;
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
    this.reset_turn_state();
  }

  switch_session(id: string) {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) return;
    this.active_id = id;
    this.provider_id = session.provider_id;
    this.scope = session.scope;
    this.mode = session.mode;
    this.permission_mode = session.permission_mode;
    this.reset_turn_state();
  }

  rename_session(
    id: string,
    title: string,
    source: AssistantTitleSource = "manual",
  ) {
    this.store.rename(id, title, source);
  }

  fork_session(message_id: string): string | null {
    const session = this.active;
    if (!session) return null;
    const idx = session.messages.findIndex((m) => m.id === message_id);
    if (idx === -1) return null;

    const fork = this.store.create({
      kind: CHAT_KIND,
      title: `${session.title} (fork)`,
      provider_id: session.provider_id,
      origin: session.origin,
      scope: session.scope,
      mode: session.mode,
      permission_mode: session.permission_mode,
    });
    // A fork of a chat the user named is still named, not up for autotitling.
    this.store.rename(fork.id, fork.title, session.title_source);
    this.store.replace_messages(
      fork.id,
      JSON.parse(
        JSON.stringify(session.messages.slice(0, idx + 1)),
      ) as AssistantMessage[],
    );
    this.store.patch_session(fork.id, {
      changed_files: session.changed_files,
      ...(session.agent_session_id
        ? { agent_session_id: session.agent_session_id }
        : {}),
    });

    this.active_id = fork.id;
    this.reset_turn_state();
    return fork.id;
  }

  truncate_after(message_id: string) {
    const session = this.active;
    if (!session) return;
    const idx = session.messages.findIndex((m) => m.id === message_id);
    if (idx === -1) return;
    let user_idx = idx;
    while (user_idx >= 0 && session.messages[user_idx]?.role !== "user") {
      user_idx -= 1;
    }
    if (user_idx < 0) return;
    this.store.replace_messages(
      session.id,
      session.messages.slice(0, user_idx + 1),
    );
  }

  delete_session(id: string) {
    this.store.delete_session(id);
    if (this.active_id === id) {
      this.active_id = null;
      this.streaming_id = null;
      this.is_loading = false;
      this.error = null;
    }
    this.revision += 1;
  }

  // Sessions arrive through the assistant store's own hydrate on a vault
  // switch; what the panel must drop is the view state still pointing at the
  // old vault's sessions.
  reset_view_state() {
    this.active_id = null;
    this.streaming_id = null;
    this.is_loading = false;
    this.error = null;
  }

  begin_turn(): number {
    this.pending_sources = null;
    this.revision += 1;
    return this.revision;
  }

  private create_session(first_content: string): string {
    const session = this.store.create({
      kind: CHAT_KIND,
      title: derive_session_title(first_content),
      provider_id: this.provider_id,
      scope: this.scope,
      mode: this.mode,
      permission_mode: this.permission_mode,
    });
    this.active_id = session.id;
    return session.id;
  }

  private reset_turn_state() {
    this.error = null;
    this.is_loading = false;
    this.streaming_id = null;
    this.pending_sources = null;
    this.agent_running_tool = null;
    this.revision += 1;
  }

  private patch_active(changes: AssistantSessionPatch) {
    if (this.active_id) this.store.patch_session(this.active_id, changes);
  }

  private update_streaming(
    transform: (message: AssistantMessage) => Partial<AssistantMessage>,
  ) {
    const session_id = this.active_id;
    const sid = this.streaming_id;
    if (!session_id || !sid) return;
    const message = this.messages.find((m) => m.id === sid);
    if (!message) return;
    this.store.update_message(session_id, sid, transform(message));
  }
}
