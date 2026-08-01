import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AiCliProbeStatus } from "$lib/features/ai";
import type { RunEvent, RunRequest } from "$lib/features/assistant/types/run";

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
