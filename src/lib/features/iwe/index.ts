export { IweService } from "$lib/features/iwe/application/iwe_service";
export { register_iwe_actions } from "$lib/features/iwe/application/iwe_actions";
export { IweStore } from "$lib/features/iwe/state/iwe_store.svelte";
export type { IwePort } from "$lib/features/iwe/ports";
export { create_iwe_tauri_adapter } from "$lib/features/iwe/adapters/iwe_tauri_adapter";
export { default as IweStatusIndicator } from "$lib/features/iwe/ui/iwe_status_indicator.svelte";
export type {
  IweStatus,
  IweHoverResult,
  IweLocation,
  IweCodeAction,
  IweCompletionItem,
  IweSymbol,
  IweTextEdit,
  IweWorkspaceEditResult,
  IwePrepareRenameResult,
  IweInlayHint,
} from "$lib/features/iwe/types";
