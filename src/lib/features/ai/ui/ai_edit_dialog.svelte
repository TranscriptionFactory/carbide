<script lang="ts">
  import OptionalSurface from "$lib/shared/ui/optional_surface.svelte";
  import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
  import type {
    AiApplyTarget,
    AiCliStatus,
    AiConversationTurn,
    AiExecutionResult,
    AiMode,
  } from "$lib/features/ai/domain/ai_types";

  type AiEditDialogProps = {
    open: boolean;
    provider_id: string;
    providers: AiProviderConfig[];
    mode: AiMode;
    prompt: string;
    cli_status: AiCliStatus;
    cli_error: string | null;
    target: AiApplyTarget;
    note_path: string | null;
    note_title: string | null;
    selection_text: string | null;
    original_text: string;
    is_executing: boolean;
    turns: AiConversationTurn[];
    result: AiExecutionResult | null;
    vault_context_enabled: boolean;
    on_open_change: (open: boolean) => void;
    on_provider_change: (provider_id: string) => void;
    on_mode_change: (mode: AiMode) => void;
    on_target_change: (target: AiApplyTarget) => void;
    on_prompt_change: (prompt: string) => void;
    on_execute: () => void;
    on_apply: (output?: string) => void;
    on_clear_result: () => void;
    on_vault_context_toggle: () => void;
  };

  let {
    open,
    provider_id,
    providers,
    mode,
    prompt,
    cli_status,
    cli_error,
    target,
    note_path,
    note_title,
    selection_text,
    original_text,
    is_executing,
    turns,
    result,
    vault_context_enabled,
    on_open_change,
    on_provider_change,
    on_mode_change,
    on_target_change,
    on_prompt_change,
    on_execute,
    on_apply,
    on_clear_result,
    on_vault_context_toggle,
  }: AiEditDialogProps = $props();

  const load_ai_edit_dialog = () =>
    import("$lib/features/ai/ui/ai_edit_dialog_content.svelte");
</script>

<OptionalSurface
  loader={load_ai_edit_dialog}
  component_props={{
    open,
    provider_id,
    providers,
    mode,
    prompt,
    cli_status,
    cli_error,
    target,
    note_path,
    note_title,
    selection_text,
    original_text,
    is_executing,
    turns,
    result,
    vault_context_enabled,
    on_open_change,
    on_provider_change,
    on_mode_change,
    on_target_change,
    on_prompt_change,
    on_execute,
    on_apply,
    on_clear_result,
    on_vault_context_toggle,
  }}
  loading_label="Loading AI…"
  error_label="Failed to load AI dialog"
/>
