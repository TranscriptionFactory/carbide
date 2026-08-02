import { invoke } from "@tauri-apps/api/core";
import { APP_DIR } from "$lib/shared/constants/special_folders";
import { to_assistant_session_summary } from "$lib/features/assistant/types/session";
import type { AssistantSessionPersistencePort } from "$lib/features/assistant/ports";
import type {
  AssistantSession,
  AssistantSessionKind,
  AssistantSessionSummary,
} from "$lib/features/assistant/types/session";

const ASSISTANT_DIR = `${APP_DIR}/assistant`;
const INDEX_PATH = `${ASSISTANT_DIR}/index.json`;

// Pre-C1 sessions lived under rag/ and only ever held chats. Reads fall back
// here; the next save rewrites everything into ASSISTANT_DIR, so the fallback
// is a one-way ramp rather than a second home.
const LEGACY_DIR = `${APP_DIR}/rag`;
const LEGACY_INDEX_PATH = `${LEGACY_DIR}/index.json`;

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

// Files written before `kind` existed are missing it, in both the index and
// the session files themselves.
type StoredSummary = Omit<AssistantSessionSummary, "kind"> &
  Partial<Pick<AssistantSessionSummary, "kind">>;

type StoredSession = Omit<AssistantSession, "kind"> &
  Partial<Pick<AssistantSession, "kind">>;

function assert_safe_id(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Invalid assistant session id: ${id}`);
  }
}

function session_path(id: string): string {
  assert_safe_id(id);
  return `${ASSISTANT_DIR}/sessions/${id}.json`;
}

function legacy_session_path(id: string): string {
  assert_safe_id(id);
  return `${LEGACY_DIR}/sessions/${id}.json`;
}

async function read_json<T>(
  vault_id: string,
  relative_path: string,
): Promise<T | null> {
  try {
    const content = await invoke<string>("read_vault_file", {
      vaultId: vault_id,
      relativePath: relative_path,
    });
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function write_json(
  vault_id: string,
  relative_path: string,
  value: unknown,
): Promise<void> {
  await invoke("write_vault_file", {
    vaultId: vault_id,
    relativePath: relative_path,
    content: JSON.stringify(value, null, 2),
  });
}

async function delete_file(
  vault_id: string,
  relative_path: string,
): Promise<void> {
  try {
    await invoke("delete_vault_file", {
      vaultId: vault_id,
      relativePath: relative_path,
    });
  } catch {
    // the file may already be gone; the index is the source of truth
  }
}

function sort_by_recency(
  summaries: AssistantSessionSummary[],
): AssistantSessionSummary[] {
  return [...summaries].sort((a, b) => b.updated_at - a.updated_at);
}

function stamp_kind<T extends { kind?: AssistantSessionKind }>(
  stored: T,
): T & { kind: AssistantSessionKind } {
  return { ...stored, kind: stored.kind ?? "chat" };
}

export function create_assistant_session_persistence_tauri_adapter(): AssistantSessionPersistencePort {
  async function read_index(
    vault_id: string,
  ): Promise<AssistantSessionSummary[]> {
    const stored =
      (await read_json<StoredSummary[]>(vault_id, INDEX_PATH)) ??
      (await read_json<StoredSummary[]>(vault_id, LEGACY_INDEX_PATH)) ??
      [];
    return stored.map(stamp_kind);
  }

  return {
    async list_sessions(vault_id) {
      return sort_by_recency(await read_index(vault_id));
    },

    async load_session(vault_id, id) {
      const stored =
        (await read_json<StoredSession>(vault_id, session_path(id))) ??
        (await read_json<StoredSession>(vault_id, legacy_session_path(id)));
      return stored ? stamp_kind(stored) : null;
    },

    async save_session(vault_id, session) {
      await write_json(vault_id, session_path(session.id), session);
      const index = await read_index(vault_id);
      const next = sort_by_recency([
        to_assistant_session_summary(session),
        ...index.filter((s) => s.id !== session.id),
      ]);
      await write_json(vault_id, INDEX_PATH, next);
    },

    async delete_session(vault_id, id) {
      const index = await read_index(vault_id);
      await write_json(
        vault_id,
        INDEX_PATH,
        index.filter((s) => s.id !== id),
      );
      await delete_file(vault_id, session_path(id));
      await delete_file(vault_id, legacy_session_path(id));
    },
  };
}
