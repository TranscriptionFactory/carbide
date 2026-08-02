export { register_ai_actions } from "$lib/features/ai/application/ai_actions";
export { AiService } from "$lib/features/ai/application/ai_service";
export {
  AgenticEditRunner,
  type AgentCheckpointGit,
} from "$lib/features/ai/application/agentic_edit_runner";
export {
  AiStore,
  type AiDialogState,
} from "$lib/features/ai/state/ai_store.svelte";
export type { AiPort } from "$lib/features/ai/ports";
export {
  create_plugin_ai_host,
  type PluginAiHost,
  type PluginAiHostDeps,
} from "$lib/features/ai/application/plugin_ai_host";
export { derive_provider_hint } from "$lib/features/ai/domain/ai_provider_hint";
export { create_ai_tauri_adapter } from "$lib/features/ai/adapters/ai_tauri_adapter";
export type {
  AiStreamChunk,
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
  agent_capability,
  infer_agent_descriptor,
  provider_supports_streaming,
  type AgentBackend,
  type AgentCapability,
} from "$lib/features/ai/domain/ai_provider_capabilities";
export {
  chat_policy,
  inline_edit_policy,
  type SurfacePolicy,
  type ToolSelector,
} from "$lib/features/ai/domain/agent_run_policy";
export {
  describe_default_provider,
  type AiProviderProbeState,
} from "$lib/features/ai/domain/ai_provider_status";
export {
  preferred_ai_backend_order,
  resolve_auto_ai_backend,
} from "$lib/features/ai/domain/ai_backend_selection";
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
// I5's before/after → Proposal producer. Exported because ambient notices
// (C3) build proposals from outside this feature; the helper itself is
// AI-agnostic and only happens to live here.
export { build_proposal } from "$lib/features/ai/domain/ai_diff";
export { default as AiAssistantPanel } from "$lib/features/ai/ui/ai_assistant_panel.svelte";
