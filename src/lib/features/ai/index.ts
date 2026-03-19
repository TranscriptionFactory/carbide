export { register_ai_actions } from "$lib/features/ai/application/ai_actions";
export { AiService } from "$lib/features/ai/application/ai_service";
export {
  AiStore,
  type AiDialogState,
} from "$lib/features/ai/state/ai_store.svelte";
export type { AiPort } from "$lib/features/ai/ports";
export { create_ai_tauri_adapter } from "$lib/features/ai/adapters/ai_tauri_adapter";
export {
  BUILTIN_PROVIDER_PRESETS,
  type AiApplyTarget,
  type AiTransport,
  type AiCliTransport,
  type AiApiTransport,
  type AiMode,
  type AiCliStatus,
  type AiDialogContext,
  type AiExecutionResult,
  type AiPortExecuteRequest,
  type AiProviderConfig,
  type AiProviderId,
  provider_command,
} from "$lib/features/ai/domain/ai_types";
export { build_ai_prompt } from "$lib/features/ai/domain/ai_prompt_builder";
export { migrate_ai_settings } from "$lib/features/ai/domain/ai_settings_migration";
export { default as AiEditDialog } from "$lib/features/ai/ui/ai_edit_dialog.svelte";
export { default as AiAssistantPanel } from "$lib/features/ai/ui/ai_assistant_panel.svelte";
