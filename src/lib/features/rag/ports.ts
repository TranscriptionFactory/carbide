import type {
  RagSession,
  RagSessionSummary,
} from "$lib/features/rag/domain/rag_types";

export interface RagPersistencePort {
  list_sessions(vault_id: string): Promise<RagSessionSummary[]>;
  load_session(vault_id: string, id: string): Promise<RagSession | null>;
  save_session(vault_id: string, session: RagSession): Promise<void>;
  delete_session(vault_id: string, id: string): Promise<void>;
}
