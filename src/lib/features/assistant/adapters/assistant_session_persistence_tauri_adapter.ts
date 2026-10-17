import { invoke } from "@tauri-apps/api/core";
import { APP_DIR } from "$lib/shared/constants/special_folders";
import {
  read_json,
  write_json,
} from "$lib/features/assistant/adapters/vault_json";
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
// here and copy the file into ASSISTANT_DIR on the spot, so the fallback is a
// one-way ramp paid once per session rather than two reads on every launch.
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

  // Index updates are read-modify-write over one file; run them one at a time
  // so a burst (hydration pruning) cannot drop another call's change.
  let index_tail: Promise<unknown> = Promise.resolve();
  function update_index(
    vault_id: string,
    change: (index: AssistantSessionSummary[]) => AssistantSessionSummary[],
  ): Promise<void> {
    const run = index_tail.then(async () => {
      await write_json(
        vault_id,
        INDEX_PATH,
        change(await read_index(vault_id)),
      );
    });
    index_tail = run.catch(() => undefined);
    return run;
  }

  return {
    async list_sessions(vault_id) {
      return sort_by_recency(await read_index(vault_id));
    },

    async load_session(vault_id, id) {
      const current = await read_json<StoredSession>(
        vault_id,
        session_path(id),
      );
      if (current) return stamp_kind(current);
      const legacy = await read_json<StoredSession>(
        vault_id,
        legacy_session_path(id),
      );
      if (!legacy) return null;
      const session = stamp_kind(legacy);
      try {
        await write_json(vault_id, session_path(id), session);
      } catch {
        // read-only vault: the body is still good, the copy retries next load
      }
      return session;
    },

    async save_session(vault_id, session) {
      await write_json(vault_id, session_path(session.id), session);
      await update_index(vault_id, (index) =>
        sort_by_recency([
          to_assistant_session_summary(session),
          ...index.filter((s) => s.id !== session.id),
        ]),
      );
    },

    async delete_session(vault_id, id) {
      await update_index(vault_id, (index) => index.filter((s) => s.id !== id));
      await delete_file(vault_id, session_path(id));
      await delete_file(vault_id, legacy_session_path(id));
    },
  };
}
