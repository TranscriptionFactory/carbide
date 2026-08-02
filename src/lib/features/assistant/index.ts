export { ABORTED_ERROR } from "$lib/features/assistant/types/run";

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
  RunStarter,
  RunStats,
  RunStatus,
} from "$lib/features/assistant/types/run";

export {
  start_run_stream,
  type RunStream,
  type RunStreamEnd,
  type RunStreamItem,
} from "$lib/features/assistant/application/run_stream";

export type {
  AssistantProviderProbePort,
  AssistantSessionPersistencePort,
  AssistantTransportPort,
  TransportRequest,
} from "$lib/features/assistant/ports";

export { to_assistant_session_summary } from "$lib/features/assistant/types/session";

export type {
  AssistantChatMode,
  AssistantCitation,
  AssistantContextStats,
  AssistantMessage,
  AssistantPermissionMode,
  AssistantRole,
  AssistantScope,
  AssistantSession,
  AssistantSessionKind,
  AssistantSessionSummary,
  AssistantTitleSource,
  AssistantToolCall,
  AssistantToolEvent,
} from "$lib/features/assistant/types/session";

export { AssistantRunStore } from "$lib/features/assistant/state/assistant_run_store.svelte";

export {
  AssistantSessionStore,
  type AssistantSessionCreate,
  type AssistantSessionPatch,
} from "$lib/features/assistant/state/assistant_session_store.svelte";

export { create_session_run_sink } from "$lib/features/assistant/application/session_run_sink";

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
export { default as AssistantSessionTabView } from "$lib/features/assistant/ui/assistant_session_tab_view.svelte";
export { default as AssistantSessionList } from "$lib/features/assistant/ui/assistant_session_list.svelte";
export {
  assemble_context,
  estimate_tokens,
  DEFAULT_CONTEXT_BUDGET,
  type ContextBudget,
  type ContextAssembly,
  type ContextStats,
  type AssembledBlock,
  type DroppedBlock,
  type DropReason,
} from "$lib/features/assistant/domain/context_assembler";
export {
  type ContextBlock,
  type ContextSource,
} from "$lib/features/assistant/domain/context_source";
export {
  context_window,
  extract_line_range,
  type CharWindow,
} from "$lib/features/assistant/domain/context_window";
