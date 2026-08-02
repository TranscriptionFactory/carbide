import {
  to_assistant_session_summary,
  type AssistantChatMode,
  type AssistantMessage,
  type AssistantPermissionMode,
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
  permission_mode?: AssistantPermissionMode;
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
    | "permission_mode"
    | "changed_files"
    | "agent_session_id"
  >
>;

const NOT_IMPLEMENTED = "NOT_IMPLEMENTED: AU-010 implements the session store";

// I4: the one session store. RagStore's session ownership migrates here
// (AU-010); surfaces keep their own view state but never their own copy of a
// session. Read paths are real because they are the frozen shape UI lanes
// build against; every mutator is AU-010's to implement.
export class AssistantSessionStore {
  sessions = $state<AssistantSession[]>([]);

  // Injectable clock (AU-005 precedent) — create/touch/prune timestamps come
  // from here so tests never sleep. Public until AU-010's mutators consume it.
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

  create(_input: AssistantSessionCreate): AssistantSession {
    throw new Error(NOT_IMPLEMENTED);
  }

  append_message(_id: string, _message: AssistantMessage): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  update_message(
    _id: string,
    _message_id: string,
    _changes: Partial<AssistantMessage>,
  ): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  replace_messages(_id: string, _messages: AssistantMessage[]): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  patch_session(_id: string, _changes: AssistantSessionPatch): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  rename(
    _id: string,
    _title: string,
    _source: AssistantTitleSource = "manual",
  ): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  delete_session(_id: string): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  hydrate(_sessions: AssistantSession[]): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  // Returns the pruned ids so the caller can delete their persisted files.
  // The 30-day policy itself lives in vault settings (R3), not here.
  prune(_max_age_ms: number): string[] {
    throw new Error(NOT_IMPLEMENTED);
  }
}
