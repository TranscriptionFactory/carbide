export { register_ai_actions } from "$lib/features/ai/application/ai_actions";
export { AiService } from "$lib/features/ai/application/ai_service";
export {
  AiStore,
  type AiDialogState,
} from "$lib/features/ai/state/ai_store.svelte";
export type { AiPort } from "$lib/features/ai/ports";
export { create_ai_tauri_adapter } from "$lib/features/ai/adapters/ai_tauri_adapter";
export {
  AI_PROVIDER_DISPLAY,
  DEFAULT_OLLAMA_MODEL,
  type AiApplyTarget,
  type AiMode,
  type AiCliStatus,
  type AiDialogContext,
  type AiExecutionResult,
  type AiPortRequest,
  type AiProvider,
} from "$lib/features/ai/domain/ai_types";
export { build_ai_prompt } from "$lib/features/ai/domain/ai_prompt_builder";
export { default as AiEditDialog } from "$lib/features/ai/ui/ai_edit_dialog.svelte";
export { default as AiAssistantPanel } from "$lib/features/ai/ui/ai_assistant_panel.svelte";
