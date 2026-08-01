export type {
  AssistantUserError,
  RunEvent,
  RunHandle,
  RunId,
  RunKind,
  RunOrigin,
  RunOutcome,
  RunRecord,
  RunRequest,
  RunSink,
  RunSpec,
  RunStats,
  RunStatus,
} from "$lib/features/assistant/types/run";

export type {
  AssistantProviderProbePort,
  AssistantTransportPort,
  TransportRequest,
} from "$lib/features/assistant/ports";

export { AssistantRunStore } from "$lib/features/assistant/state/assistant_run_store.svelte";

export {
  AssistantKernelService,
  type AssistantKernelDeps,
} from "$lib/features/assistant/application/assistant_kernel_service";

export {
  resolve_assistant_provider,
  type ProviderResolution,
  type ProviderResolutionInput,
} from "$lib/features/assistant/domain/resolve_assistant_provider";

export { create_assistant_transport_tauri_adapter } from "$lib/features/assistant/adapters/assistant_transport_tauri_adapter";

export { register_assistant_actions } from "$lib/features/assistant/application/assistant_actions";

export { default as AssistantPresence } from "$lib/features/assistant/ui/assistant_presence.svelte";
export { default as AssistantRunsPopover } from "$lib/features/assistant/ui/assistant_runs_popover.svelte";
export { default as AssistantStopButton } from "$lib/features/assistant/ui/assistant_stop_button.svelte";
