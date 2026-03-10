<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import {
    AI_PROVIDER_DISPLAY,
    type AiApplyTarget,
    type AiCliStatus,
    type AiExecutionResult,
    type AiProvider,
  } from "$lib/features/ai/domain/ai_types";

  type Props = {
    open: boolean;
    provider: AiProvider;
    prompt: string;
    ollama_model: string;
    cli_status: AiCliStatus;
    cli_error: string | null;
    target: AiApplyTarget;
    note_title: string | null;
    selection_text: string | null;
    is_executing: boolean;
    result: AiExecutionResult | null;
    on_open_change: (open: boolean) => void;
    on_provider_change: (provider: AiProvider) => void;
    on_target_change: (target: AiApplyTarget) => void;
    on_prompt_change: (prompt: string) => void;
    on_ollama_model_change: (model: string) => void;
    on_execute: () => void;
    on_apply: () => void;
    on_clear_result: () => void;
  };

  let {
    open,
    provider,
    prompt,
    ollama_model,
    cli_status,
    cli_error,
    target,
    note_title,
    selection_text,
    is_executing,
    result,
    on_open_change,
    on_provider_change,
    on_target_change,
    on_prompt_change,
    on_ollama_model_change,
    on_execute,
    on_apply,
    on_clear_result,
  }: Props = $props();

  const provider_display = $derived(AI_PROVIDER_DISPLAY[provider]);
  const provider_options: AiProvider[] = ["claude", "codex", "ollama"];
  const selection_available = $derived(
    Boolean(selection_text && selection_text.trim() !== ""),
  );
  const selection_preview = $derived(
    selection_text ? selection_text.trim().slice(0, 180) : "",
  );
  const execute_disabled = $derived(
    prompt.trim() === "" ||
      is_executing ||
      cli_status !== "available" ||
      (provider === "ollama" && ollama_model.trim() === ""),
  );

  function handle_prompt_keydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!execute_disabled) {
        on_execute();
      }
    }
  }
</script>

<Dialog.Root {open} onOpenChange={on_open_change}>
  <Dialog.Content class="max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>AI Assistant</Dialog.Title>
      <Dialog.Description>
        {#if note_title}
          {target === "selection"
            ? `Editing a selection in ${note_title}`
            : `Editing ${note_title}`}
        {:else}
          Review and apply AI-assisted note edits
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <div class="space-y-2">
        <label class="text-sm font-medium" for="ai-provider"> Backend </label>
        <Select.Root
          type="single"
          value={provider}
          onValueChange={(value: string | undefined) => {
            if (value === "claude" || value === "codex" || value === "ollama") {
              on_provider_change(value);
            }
          }}
        >
          <Select.Trigger id="ai-provider" class="w-48">
            <span data-slot="select-value">{provider_display.name}</span>
          </Select.Trigger>
          <Select.Content>
            {#each provider_options as option (option)}
              <Select.Item value={option}>
                {AI_PROVIDER_DISPLAY[option].name}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium">Scope</p>
        <div class="flex flex-wrap gap-2">
          <Button
            variant={target === "selection" ? "default" : "outline"}
            disabled={!selection_available}
            onclick={() => on_target_change("selection")}
          >
            Selection
          </Button>
          <Button
            variant={target === "full_note" ? "default" : "outline"}
            onclick={() => on_target_change("full_note")}
          >
            Full Note
          </Button>
        </div>
      </div>

      {#if cli_status === "checking"}
        <div
          class="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
        >
          Checking for {provider_display.cli_name}…
        </div>
      {:else if cli_status === "unavailable"}
        <div
          class="rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-sm text-orange-700 dark:text-orange-400"
        >
          <p class="font-medium">{provider_display.cli_name} not found</p>
          <p>
            Install it from
            <a
              class="font-medium underline underline-offset-4"
              href={provider_display.install_url}
              rel="noreferrer"
              target="_blank"
            >
              {provider_display.install_url}
            </a>
            and restart Otterly.
          </p>
        </div>
      {:else if cli_status === "error"}
        <div
          class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {cli_error ?? `Failed to check ${provider_display.cli_name}.`}
        </div>
      {/if}

      {#if provider === "ollama"}
        <div class="space-y-2">
          <label class="text-sm font-medium" for="ai-ollama-model">
            Ollama model
          </label>
          <Input
            id="ai-ollama-model"
            value={ollama_model}
            oninput={(event) =>
              on_ollama_model_change(event.currentTarget.value)}
            disabled={is_executing}
          />
        </div>
      {/if}

      <div
        class="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
      >
        <p>
          Sending the
          <span class="font-medium text-foreground">
            {target === "selection" ? "selected text" : "full note"}
          </span>
          to {provider_display.name}.
        </p>
        {#if target === "selection" && selection_preview}
          <p
            class="mt-2 line-clamp-4 whitespace-pre-wrap font-mono text-xs text-muted-foreground"
          >
            {selection_preview}
          </p>
        {/if}
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium" for="ai-prompt">
          Instructions
        </label>
        <textarea
          id="ai-prompt"
          class="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Describe how you want to edit the note…"
          value={prompt}
          oninput={(event) => on_prompt_change(event.currentTarget.value)}
          onkeydown={handle_prompt_keydown}
          disabled={is_executing || cli_status === "unavailable"}
        ></textarea>
        <p class="text-xs text-muted-foreground">
          Press Cmd/Ctrl+Enter to run.
        </p>
      </div>

      {#if result}
        {#if result.success}
          <div class="space-y-3">
            <div
              class="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
            >
              Review the generated content before applying it to the note.
              <span class="ml-1 text-foreground">
                Backend: {provider_display.name}
              </span>
            </div>
            <textarea
              class="min-h-80 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              readonly
              value={result.output}
            ></textarea>
          </div>
        {:else}
          <div
            class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {result.error ??
              `${provider_display.name} failed to edit the note.`}
          </div>
        {/if}
      {/if}
    </div>

    <Dialog.Footer>
      {#if result}
        <Button variant="outline" onclick={on_clear_result}>
          Dismiss Draft
        </Button>
      {/if}
      <Button variant="outline" onclick={() => on_open_change(false)}>
        {result ? "Close" : "Cancel"}
      </Button>
      {#if result?.success}
        <Button onclick={on_apply}>
          {target === "selection" ? "Apply to Selection" : "Replace Note"}
        </Button>
      {/if}
      <Button onclick={on_execute} disabled={execute_disabled}>
        {is_executing
          ? `Running ${provider_display.name}…`
          : result
            ? "Refine Draft"
            : "Generate Draft"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
