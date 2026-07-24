import type {
  RagSession,
  RagSessionSummary,
} from "$lib/features/rag/domain/rag_types";
import type {
  AgentEvent,
  AgentPermissionMode,
} from "$lib/features/rag/types/agent_events";
import type { AiMessage } from "$lib/features/rag/domain/agent_history";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

export interface RagPersistencePort {
  list_sessions(vault_id: string): Promise<RagSessionSummary[]>;
  load_session(vault_id: string, id: string): Promise<RagSession | null>;
  save_session(vault_id: string, session: RagSession): Promise<void>;
  delete_session(vault_id: string, id: string): Promise<void>;
}

export type AgentStreamRequest = {
  provider_config: AiProviderConfig;
  prompt: string;
  vault_path: string;
  permission_mode: AgentPermissionMode;
  history: AiMessage[];
  resume_session_id?: string;
  backend: "harness" | "native";
  signal?: AbortSignal;
};

export interface AgentPort {
  stream_turn(input: AgentStreamRequest): AsyncIterable<AgentEvent>;
}
