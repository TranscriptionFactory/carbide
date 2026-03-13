export type {
  TerminalExitEvent,
  TerminalPort,
  TerminalSessionHandle,
  TerminalSpawnOptions,
} from "$lib/features/terminal/ports";
export { create_terminal_tauri_adapter } from "$lib/features/terminal/adapters/terminal_tauri_adapter";
export {
  TerminalService,
  type TerminalSessionReconcileInput,
  type TerminalSessionRequest,
} from "$lib/features/terminal/application/terminal_service";
export {
  DEFAULT_TERMINAL_SESSION_ID,
  TerminalStore,
  type TerminalCwdPolicy,
  type TerminalRespawnPolicy,
  type TerminalSessionMeta,
  type TerminalSessionStatus,
} from "$lib/features/terminal/state/terminal_store.svelte";
export { register_terminal_actions } from "$lib/features/terminal/application/terminal_actions";
export { default as TerminalPanel } from "$lib/features/terminal/ui/terminal_panel.svelte";
