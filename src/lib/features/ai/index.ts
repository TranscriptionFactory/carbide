export { register_ai_actions } from "$lib/features/ai/application/ai_actions";
export { AiService } from "$lib/features/ai/application/ai_service";
export {
  AiStore,
  type AiDialogState,
} from "$lib/features/ai/state/ai_store.svelte";
export type { AiPort } from "$lib/features/ai/ports";
export type { AiStreamPort } from "$lib/features/ai/ports";
export type { AiHistoryPersistencePort } from "$lib/features/ai/ports";
export { create_ai_tauri_adapter } from "$lib/features/ai/adapters/ai_tauri_adapter";
export { create_ai_stream_adapter } from "$lib/features/ai/adapters/ai_stream_adapter";
export { create_ai_history_tauri_adapter } from "$lib/features/ai/adapters/ai_history_tauri_adapter";
export type {
  AiStreamChunk,
  AiStreamRequest,
  AiMessage,
  AiMessageContent,
  AiTextPart,
  AiImagePart,
} from "$lib/features/ai/domain/ai_stream_types";
export { extract_note_image_targets } from "$lib/features/ai/domain/note_image_refs";
export {
  collect_note_image_parts,
  collect_open_note_image_parts,
} from "$lib/features/ai/application/note_image_loader";
export { MarkdownJoiner } from "$lib/features/ai/domain/markdown_joiner";
export {
  describe_default_provider,
  type AiProviderProbeState,
} from "$lib/features/ai/domain/ai_provider_status";
export type {
  AiCliProbe,
  AiCliProbeStatus,
  AiConversationTurn,
} from "$lib/features/ai/domain/ai_types";
export {
  humanize_ai_error,
  type AiUserError,
} from "$lib/features/ai/domain/ai_error_messages";
export {
  BUILTIN_PROVIDER_PRESETS,
  type AiApplyTarget,
  type AiTransport,
  type AiCliTransport,
  type AiApiTransport,
  type AiMode,
  type AiCliStatus,
  type AiDialogContext,
  type AiDialogDocumentContext,
  type AiDialogNoteContext,
  type AiExecutionResult,
  type AiPortExecuteRequest,
  type AiProviderConfig,
  type AiProviderId,
  type AiVaultContext,
  type AiVaultContextNote,
  type VaultContextSettings,
  context_key,
  context_original_text,
  provider_command,
} from "$lib/features/ai/domain/ai_types";
export {
  build_ai_prompt,
  build_ai_document_prompt,
  build_ai_inline_prompt,
} from "$lib/features/ai/domain/ai_prompt_builder";
export { migrate_ai_settings } from "$lib/features/ai/domain/ai_settings_migration";
export {
  type AiInlineCommand,
  BUILTIN_INLINE_COMMANDS,
  resolve_inline_commands,
} from "$lib/features/ai/domain/ai_inline_commands";
export { default as AiEditDialog } from "$lib/features/ai/ui/ai_edit_dialog.svelte";
export { default as AiAssistantPanel } from "$lib/features/ai/ui/ai_assistant_panel.svelte";
