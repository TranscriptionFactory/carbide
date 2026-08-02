import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AiCliProbeStatus } from "$lib/features/ai";
import type { RunEvent, RunRequest } from "$lib/features/assistant/types/run";
import type {
  AssistantSession,
  AssistantSessionSummary,
} from "$lib/features/assistant/types/session";

export type TransportRequest = {
  provider_config: AiProviderConfig;
  request: RunRequest;
  vault_path: string | null;
  signal?: AbortSignal;
};

// One transport for every assistant execution. Both wire channels the app used
// to have (`ai:chunk:*` text streaming and `agent-run-event:*` agent turns) are
// parameterizations of this single contract; the mode on RunRequest selects.
export interface AssistantTransportPort {
  stream(input: TransportRequest): AsyncIterable<RunEvent>;
}

export interface AssistantProviderProbePort {
  detect_status(config: AiProviderConfig): Promise<AiCliProbeStatus>;
}

// C1 contract: per-session files (I8 — the only persisted-format change of the
// program happens this cycle). Same shape as rag's RagPersistencePort so
// AU-014's adapter and hydration reactor are a port swap, not a redesign;
// list/load split keeps hydration lazy for large vaults.
export interface AssistantSessionPersistencePort {
  list_sessions(vault_id: string): Promise<AssistantSessionSummary[]>;
  load_session(vault_id: string, id: string): Promise<AssistantSession | null>;
  save_session(vault_id: string, session: AssistantSession): Promise<void>;
  delete_session(vault_id: string, id: string): Promise<void>;
}
