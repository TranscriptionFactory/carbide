import type {
  AssistantScope,
  AssistantSession,
} from "$lib/features/assistant/types/session";

const MAX_TITLE_LENGTH = 60;

export function derive_session_title(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (trimmed === "") return "New chat";
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE_LENGTH).trimEnd()}…`;
}

export function should_autotitle(session: AssistantSession): boolean {
  return session.title_source === "derived";
}

export function sanitize_generated_title(raw: string): string | null {
  const stripped = raw
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
  if (stripped === "") return null;
  if (stripped.includes("\n")) return null;
  if (stripped.length > MAX_TITLE_LENGTH) return null;
  return stripped;
}

type MigratedField =
  | "kind"
  | "title_source"
  | "origin"
  | "mode"
  | "permission_mode"
  | "changed_files";

export type StoredAssistantSession = Omit<AssistantSession, MigratedField> &
  Partial<Pick<AssistantSession, MigratedField>>;

// The one hydration boundary. Files written before a field existed are missing
// it, so every session reaches the store complete — `kind` is "chat" because
// rag only ever persisted chats.
//
// Every migrated field is OPTIONAL on StoredAssistantSession, which is exactly
// why losing this call would be silent: the load path still typechecks, and
// sessions merely stop matching of_kind("chat") and vanish from the list.
export function migrate_session_fields(
  session: StoredAssistantSession,
): AssistantSession {
  return {
    ...session,
    kind: session.kind ?? "chat",
    title_source: session.title_source ?? "derived",
    origin: session.origin ?? {},
    mode: session.mode ?? "ask",
    permission_mode: session.permission_mode ?? "safe",
    changed_files: session.changed_files ?? [],
  };
}

function to_scope_list(values: unknown, legacy: unknown): string[] {
  const raw = Array.isArray(values)
    ? values
    : typeof legacy === "string"
      ? [legacy]
      : [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

// The scope half of the same hydration boundary: sessions written when a scope
// held a single `folder`/`tag` string rather than an array. Travels with the
// loader that calls it rather than staying with retrieval's scope filtering,
// which never sees a stored session.
export function migrate_scope(raw: unknown): AssistantScope {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const scope: AssistantScope = {};
  const folders = to_scope_list(record.folders, record.folder);
  const tags = to_scope_list(record.tags, record.tag);
  const bases = to_scope_list(record.bases, undefined);
  if (folders.length) scope.folders = folders;
  if (tags.length) scope.tags = tags;
  if (bases.length) scope.bases = bases;
  return scope;
}
