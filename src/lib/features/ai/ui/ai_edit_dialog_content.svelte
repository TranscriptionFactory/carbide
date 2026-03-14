<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import AiAssistantContent from "$lib/features/ai/ui/ai_assistant_content.svelte";
  import {
    type AiApplyTarget,
    type AiCliStatus,
    type AiConversationTurn,
    type AiExecutionResult,
    type AiMode,
    type AiProvider,
  } from "$lib/features/ai/domain/ai_types";

  type Props = {
    open: boolean;
    provider: AiProvider;
    mode: AiMode;
    prompt: string;
    ollama_model: string;
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
    on_open_change: (open: boolean) => void;
    on_provider_change: (provider: AiProvider) => void;
    on_mode_change: (mode: AiMode) => void;
    on_target_change: (target: AiApplyTarget) => void;
    on_prompt_change: (prompt: string) => void;
    on_ollama_model_change: (model: string) => void;
    on_execute: () => void;
    on_apply: (output?: string) => void;
    on_clear_result: () => void;
  };

  let {
    open,
    provider,
    mode,
    prompt,
    ollama_model,
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
    on_open_change,
    on_provider_change,
    on_mode_change,
    on_target_change,
    on_prompt_change,
    on_ollama_model_change,
    on_execute,
    on_apply,
    on_clear_result,
  }: Props = $props();
</script>

<Dialog.Root {open} onOpenChange={on_open_change}>
  <Dialog.Content class="max-w-3xl p-0">
    <Dialog.Header class="sr-only">
      <Dialog.Title>AI Assistant</Dialog.Title>
      <Dialog.Description
        >Review and apply AI-assisted note edits</Dialog.Description
      >
    </Dialog.Header>
    <AiAssistantContent
      {provider}
      {mode}
      {prompt}
      {ollama_model}
      {cli_status}
      {cli_error}
      {target}
      {note_path}
      {note_title}
      {selection_text}
      {original_text}
      {is_executing}
      {turns}
      {result}
      close_label={result ? "Close" : "Cancel"}
      {on_provider_change}
      {on_mode_change}
      {on_target_change}
      {on_prompt_change}
      {on_ollama_model_change}
      {on_execute}
      {on_apply}
      {on_clear_result}
      on_close={() => on_open_change(false)}
    />
  </Dialog.Content>
</Dialog.Root>
