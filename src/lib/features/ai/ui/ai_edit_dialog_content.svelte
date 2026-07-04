<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import AiAssistantContent from "$lib/features/ai/ui/ai_assistant_content.svelte";
  import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
  import {
    type AiApplyTarget,
    type AiCliStatus,
    type AiConversationTurn,
    type AiExecutionResult,
    type AiMode,
  } from "$lib/features/ai/domain/ai_types";

  type Props = {
    open: boolean;
    provider_id: string;
    providers: AiProviderConfig[];
    mode: AiMode;
    prompt: string;
    cli_status: AiCliStatus;
    cli_error: string | null;
    target: AiApplyTarget;
    context_kind: "note" | "document";
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
    context_kind,
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
  }: Props = $props();
</script>

<Dialog.Root {open} onOpenChange={on_open_change}>
  <Dialog.Content class="max-w-3xl p-0">
    <Dialog.Header class="sr-only">
      <Dialog.Title>AI Assistant</Dialog.Title>
      <Dialog.Description>
        {context_kind === "document"
          ? "Review and apply AI-assisted document edits"
          : "Review and apply AI-assisted note edits"}
      </Dialog.Description>
    </Dialog.Header>
    <AiAssistantContent
      {provider_id}
      {providers}
      {mode}
      {prompt}
      {cli_status}
      {cli_error}
      {target}
      {context_kind}
      {note_path}
      {note_title}
      {selection_text}
      {original_text}
      {is_executing}
      {turns}
      {result}
      {vault_context_enabled}
      close_label={result ? "Close" : "Cancel"}
      {on_provider_change}
      {on_mode_change}
      {on_target_change}
      {on_prompt_change}
      {on_execute}
      {on_apply}
      {on_clear_result}
      on_close={() => on_open_change(false)}
      {on_vault_context_toggle}
    />
  </Dialog.Content>
</Dialog.Root>
