import { invoke } from "@tauri-apps/api/core";
import { APP_DIR } from "$lib/shared/constants/special_folders";
import { to_session_summary } from "$lib/features/rag/domain/rag_session";
import type { RagPersistencePort } from "$lib/features/rag/ports";
import type {
  RagSession,
  RagSessionSummary,
} from "$lib/features/rag/domain/rag_types";

const RAG_DIR = `${APP_DIR}/rag`;
const INDEX_PATH = `${RAG_DIR}/index.json`;

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function session_path(id: string): string {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Invalid RAG session id: ${id}`);
  }
  return `${RAG_DIR}/sessions/${id}.json`;
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

function sort_by_recency(summaries: RagSessionSummary[]): RagSessionSummary[] {
  return [...summaries].sort((a, b) => b.updated_at - a.updated_at);
}

export function create_rag_persistence_tauri_adapter(): RagPersistencePort {
  async function read_index(vault_id: string): Promise<RagSessionSummary[]> {
    return (await read_json<RagSessionSummary[]>(vault_id, INDEX_PATH)) ?? [];
  }

  return {
    async list_sessions(vault_id) {
      return sort_by_recency(await read_index(vault_id));
    },

    async load_session(vault_id, id) {
      return read_json<RagSession>(vault_id, session_path(id));
    },

    async save_session(vault_id, session) {
      await write_json(vault_id, session_path(session.id), session);
      const index = await read_index(vault_id);
      const next = sort_by_recency([
        to_session_summary(session),
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
      try {
        await invoke("delete_vault_file", {
          vaultId: vault_id,
          relativePath: session_path(id),
        });
      } catch {
        // session file may already be gone; the index is the source of truth
      }
    },
  };
}
