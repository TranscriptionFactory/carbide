import { SvelteSet } from "svelte/reactivity";
import { stub_session_from_summary } from "$lib/features/assistant/types/assistant_session_model";
import {
  to_assistant_session_summary,
  type AssistantChatMode,
  type AssistantMessage,
  type AssistantScope,
  type AssistantSession,
  type AssistantSessionKind,
  type AssistantSessionSummary,
  type AssistantTitleSource,
} from "$lib/features/assistant/types/session";

export type AssistantSessionCreate = {
  kind: AssistantSessionKind;
  title: string;
  provider_id: string;
  origin?: { note_path?: string };
  scope?: AssistantScope;
  mode?: AssistantChatMode;
  auto_approve?: boolean;
};

// Title changes go through rename() so title_source stays honest; everything
// else mutable lands here.
export type AssistantSessionPatch = Partial<
  Pick<
    AssistantSession,
    | "provider_id"
    | "origin"
    | "scope"
    | "mode"
    | "auto_approve"
    | "changed_files"
    | "agent_session_id"
  >
>;

// I4: the one session store. RagStore's session ownership migrates here
// (AU-010); surfaces keep their own view state but never their own copy of a
// session.
export class AssistantSessionStore {
  sessions = $state<AssistantSession[]>([]);
  vault_id = $state<string | null>(null);
  // Sessions whose body (messages, provider, scope…) is resident rather than a
  // summary stub. A body is never saved unless it was loaded: every mutation
  // path that reaches save_session must ensure_loaded first.
  private loaded_ids = new SvelteSet<string>();

  // Injectable clock (AU-005 precedent) — create/touch/prune timestamps come
  // from here so tests never sleep.
  constructor(readonly now: () => number = () => Date.now()) {}

  get summaries(): AssistantSessionSummary[] {
    return this.sessions.map(to_assistant_session_summary);
  }

  of_kind(kind: AssistantSessionKind): AssistantSession[] {
    return this.sessions.filter((session) => session.kind === kind);
  }

  get(id: string): AssistantSession | null {
    return this.sessions.find((session) => session.id === id) ?? null;
  }

  is_loaded(id: string): boolean {
    return this.loaded_ids.has(id);
  }

  // The only record a save path may persist: a stub written to disk would
  // replace the real body with an empty one.
  get_loaded(id: string): AssistantSession | null {
    return this.is_loaded(id) ? this.get(id) : null;
  }

  create(input: AssistantSessionCreate): AssistantSession {
    const timestamp = this.now();
    const session: AssistantSession = {
      id: crypto.randomUUID(),
      kind: input.kind,
      title: input.title,
      title_source: "derived",
      created_at: timestamp,
      updated_at: timestamp,
      provider_id: input.provider_id,
      messages: [],
      origin: input.origin ?? {},
      scope: input.scope ?? {},
      mode: input.mode ?? "ask",
      auto_approve: input.auto_approve ?? false,
      changed_files: [],
    };
    this.sessions = [session, ...this.sessions];
    this.loaded_ids.add(session.id);
    return session;
  }

  append_message(id: string, message: AssistantMessage): void {
    this.patch(id, (session) => ({
      ...session,
      messages: [...session.messages, message],
    }));
  }

  update_message(
    id: string,
    message_id: string,
    changes: Partial<AssistantMessage>,
  ): void {
    this.patch(id, (session) => {
      const index = session.messages.findIndex(
        (message) => message.id === message_id,
      );
      const target = session.messages[index];
      if (!target) return null;

      const messages = [...session.messages];
      messages[index] = { ...target, ...changes, id: message_id };
      return { ...session, messages };
    });
  }

  replace_messages(id: string, messages: AssistantMessage[]): void {
    this.patch(id, (session) => ({ ...session, messages }));
  }

  patch_session(id: string, changes: AssistantSessionPatch): void {
    if (Object.keys(changes).length === 0) return;
    this.patch(id, (session) => ({ ...session, ...changes }));
  }

  rename(
    id: string,
    title: string,
    source: AssistantTitleSource = "manual",
  ): void {
    const next = title.trim();
    if (next === "") return;
    this.patch(id, (session) => ({
      ...session,
      title: next,
      title_source: source,
    }));
  }

  delete_session(id: string): void {
    this.sessions = this.sessions.filter((session) => session.id !== id);
  }

  // Stored timestamps survive verbatim: re-stamping on load would move every
  // session to "now" on each vault open and destroy recency ordering.
  hydrate(sessions: AssistantSession[], vault_id: string | null = null): void {
    this.vault_id = vault_id;
    this.sessions = [...sessions];
    this.loaded_ids.clear();
    for (const session of sessions) this.loaded_ids.add(session.id);
  }

  // Startup hydration: the index alone fills the list; bodies arrive through
  // attach_body as sessions are opened.
  hydrate_summaries(
    summaries: AssistantSessionSummary[],
    vault_id: string | null = null,
  ): void {
    this.vault_id = vault_id;
    this.sessions = summaries.map(stub_session_from_summary);
    this.loaded_ids.clear();
  }

  // Replaces the stub in place so list order is untouched. Ignores sessions
  // no longer in the list (deleted while the body was in flight) and ones
  // already loaded (a second in-flight read must not revert later patches).
  attach_body(session: AssistantSession): void {
    if (this.is_loaded(session.id)) return;
    const index = this.sessions.findIndex((s) => s.id === session.id);
    if (index === -1) return;
    const sessions = [...this.sessions];
    sessions[index] = session;
    this.sessions = sessions;
    this.loaded_ids.add(session.id);
  }

  // Returns the pruned ids so the caller can delete their persisted files.
  // The 30-day policy itself lives in vault settings (R3), not here.
  // Age is measured from last use, not creation — an old thread picked up
  // yesterday is live.
  prune(max_age_ms: number): string[] {
    const cutoff = this.now() - max_age_ms;
    const stale = this.sessions.filter(
      (session) => session.updated_at < cutoff,
    );
    if (stale.length === 0) return [];

    const pruned = new Set(stale.map((session) => session.id));
    this.sessions = this.sessions.filter((session) => !pruned.has(session.id));
    return [...pruned];
  }

  // A transform returning null means "nothing changed", which must not bump
  // updated_at — a no-op that reorders the session list is a bug the caller
  // cannot see.
  private patch(
    id: string,
    transform: (session: AssistantSession) => AssistantSession | null,
  ): void {
    const index = this.sessions.findIndex((session) => session.id === id);
    const current = this.sessions[index];
    if (!current) return;

    const next = transform(current);
    if (!next) return;

    const sessions = [...this.sessions];
    sessions[index] = { ...next, updated_at: this.now() };
    this.sessions = sessions;
  }
}
