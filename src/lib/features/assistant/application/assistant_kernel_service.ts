import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AssistantRunStore } from "$lib/features/assistant/state/assistant_run_store.svelte";
import type {
  AssistantProviderProbePort,
  AssistantTransportPort,
} from "$lib/features/assistant/ports";
import type {
  RunHandle,
  RunId,
  RunSink,
  RunSpec,
} from "$lib/features/assistant/types/run";

const NOT_IMPLEMENTED = "AssistantKernelService: not implemented (AU-001)";

export type AssistantKernelDeps = {
  transport: AssistantTransportPort;
  probe: AssistantProviderProbePort;
  run_store: AssistantRunStore;
  vault_path: () => string | null;
  providers: () => AiProviderConfig[];
  default_provider_id: () => string;
};

// I1: every AI execution is a kernel run. This is the only place in the app
// that owns an AbortController for AI work, the only `for await` consumer of
// the transport, and the only error-humanization choke point.
//
// R8: sinks are injected rather than hard-wired, so Wave 1 can retarget where
// run events land (RagStore today, the unified session store next) without
// editing the runners again.
export class AssistantKernelService {
  constructor(private readonly deps: AssistantKernelDeps) {
    void this.deps;
  }

  start(_spec: RunSpec, _sink?: RunSink): Promise<RunHandle> {
    throw new Error(NOT_IMPLEMENTED);
  }

  stop(_id: RunId): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  stop_all(): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  is_running(_id: RunId): boolean {
    throw new Error(NOT_IMPLEMENTED);
  }

  register_sink(_sink: RunSink): () => void {
    throw new Error(NOT_IMPLEMENTED);
  }

  resolve_provider(_requested_id?: string): Promise<AiProviderConfig | null> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
