<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";
  import AiDiffView from "$lib/features/ai/ui/ai_diff_view.svelte";
  import {
    apply_ai_draft_hunk_selection,
    create_ai_draft_diff,
    type AiDraftDiff,
  } from "$lib/features/ai/domain/ai_diff";
  import { describe_ai_context_preview } from "$lib/features/ai/domain/ai_context_preview";
  import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
  import {
    type AiApplyTarget,
    type AiCliStatus,
    type AiConversationTurn,
    type AiExecutionResult,
    type AiMode,
  } from "$lib/features/ai/domain/ai_types";

  type Props = {
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
    title?: string;
    description?: string | null;
    close_label: string;
    on_provider_change: (provider_id: string) => void;
    on_mode_change: (mode: AiMode) => void;
    on_target_change: (target: AiApplyTarget) => void;
    on_prompt_change: (prompt: string) => void;
    on_execute: () => void;
    on_apply: (output?: string) => void;
    on_clear_result: () => void;
    on_close: () => void;
  };

  let {
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
    title = "AI Assistant",
    description = null,
    close_label,
    on_provider_change,
    on_mode_change,
    on_target_change,
    on_prompt_change,
    on_execute,
    on_apply,
    on_clear_result,
    on_close,
  }: Props = $props();

  const provider_config = $derived(providers.find((p) => p.id === provider_id));
  const is_ask_mode = $derived(mode === "ask");
  const last_turn = $derived(turns.length > 0 ? turns[turns.length - 1] : null);
  const last_turn_was_ask = $derived(last_turn?.mode === "ask");
  const result_is_answer = $derived(result !== null && last_turn_was_ask);
  const history_turns = $derived(
    result && turns.length > 0 ? turns.slice(0, -1) : turns,
  );
  const selection_available = $derived(
    Boolean(selection_text && selection_text.trim() !== ""),
  );
  const selection_preview = $derived(
    selection_text ? selection_text.trim().slice(0, 180) : "",
  );
  const description_text = $derived(
    description ??
      (note_title
        ? is_ask_mode
          ? `Asking about ${note_title}`
          : target === "selection"
            ? `Editing a selection in ${note_title}`
            : `Editing ${note_title}`
        : is_ask_mode
          ? "Ask questions about your note"
          : "Review and apply AI-assisted note edits"),
  );
  const draft_diff = $derived<AiDraftDiff | null>(
    result?.success && !result_is_answer
      ? create_ai_draft_diff({
          original_text,
          draft_text: result.output,
          target,
        })
      : null,
  );
  const execute_disabled = $derived(
    prompt.trim() === "" ||
      is_executing ||
      cli_status !== "available" ||
      (provider_config?.transport.kind === "cli" &&
        provider_config.transport.args.some((a) => a.includes("{model}")) &&
        !provider_config?.model?.trim()),
  );
  let selected_hunk_ids = $state<string[]>([]);
  let last_diff_signature = $state("");
  let context_preview_open = $state(false);
  let copied = $state(false);
  const context_preview = $derived(
    describe_ai_context_preview({
      note_path,
      note_title,
      target,
      original_text,
    }),
  );
  const selected_output = $derived(
    draft_diff
      ? apply_ai_draft_hunk_selection({
          diff: draft_diff,
          selected_hunk_ids,
        })
      : null,
  );
  const partial_selection_active = $derived(
    draft_diff !== null &&
      draft_diff.hunks.length > 1 &&
      selected_hunk_ids.length > 0 &&
      selected_hunk_ids.length < draft_diff.hunks.length,
  );

  $effect(() => {
    const signature = draft_diff
      ? `${result?.output ?? ""}::${draft_diff.hunks.map((hunk) => hunk.id).join(",")}`
      : "";

    if (signature === last_diff_signature) {
      return;
    }

    last_diff_signature = signature;
    selected_hunk_ids.splice(
      0,
      selected_hunk_ids.length,
      ...(draft_diff ? draft_diff.hunks.map((hunk) => hunk.id) : []),
    );
  });

  function handle_prompt_keydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!execute_disabled) {
        on_execute();
      }
    }
  }

  function toggle_hunk(hunk_id: string) {
    const index = selected_hunk_ids.indexOf(hunk_id);
    if (index >= 0) {
      selected_hunk_ids.splice(index, 1);
      return;
    }

    selected_hunk_ids.push(hunk_id);
  }

  function select_all_hunks() {
    if (!draft_diff) {
      return;
    }

    selected_hunk_ids.splice(
      0,
      selected_hunk_ids.length,
      ...draft_diff.hunks.map((hunk) => hunk.id),
    );
  }

  function clear_hunk_selection() {
    selected_hunk_ids.splice(0, selected_hunk_ids.length);
  }

  function apply_current_selection() {
    on_apply(selected_output ?? undefined);
  }

  async function copy_result() {
    if (!result?.output) return;
    await navigator.clipboard.writeText(result.output);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<div class="flex h-full min-h-0 min-w-0 flex-col">
  <!-- Toolbar -->
  <div class="flex flex-wrap items-center gap-2 border-b px-3 py-2">
    <Select.Root
      type="single"
      value={provider_id}
      onValueChange={(value: string | undefined) => {
        if (value) on_provider_change(value);
      }}
    >
      <Select.Trigger id="ai-provider" class="w-36">
        <span data-slot="select-value"
          >{provider_config?.name ?? provider_id}</span
        >
      </Select.Trigger>
      <Select.Content>
        {#each providers as p (p.id)}
          <Select.Item value={p.id}>{p.name}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>

    <Button
      variant={mode === "edit" ? "default" : "outline"}
      size="sm"
      onclick={() => on_mode_change("edit")}
    >
      Edit
    </Button>
    <Button
      variant={mode === "ask" ? "default" : "outline"}
      size="sm"
      onclick={() => on_mode_change("ask")}
    >
      Ask
    </Button>

    <div class="h-4 w-px bg-border"></div>

    <Button
      variant={target === "selection" ? "default" : "outline"}
      size="sm"
      disabled={!selection_available}
      onclick={() => on_target_change("selection")}
    >
      Selection
    </Button>
    <Button
      variant={target === "full_note" ? "default" : "outline"}
      size="sm"
      onclick={() => on_target_change("full_note")}
    >
      Full Note
    </Button>

    <span class="ml-auto truncate text-sm text-muted-foreground">
      {description_text}
    </span>
  </div>

  <!-- Status banners -->
  {#if cli_status === "checking"}
    <div class="border-b bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      Checking for {provider_config?.name ?? "CLI"}…
    </div>
  {:else if cli_status === "unavailable"}
    <div
      class="border-b border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-700 dark:text-orange-400"
    >
      <span class="font-medium">{provider_config?.name ?? "CLI"} not found</span
      >
      {#if provider_config?.install_url}
        — Install from
        <a
          class="font-medium underline underline-offset-4"
          href={provider_config.install_url}
          rel="noreferrer"
          target="_blank"
        >
          {provider_config.install_url}
        </a>
      {/if}
    </div>
  {:else if cli_status === "error"}
    <div
      class="border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {cli_error ?? `Failed to check ${provider_config?.name ?? "CLI"}.`}
    </div>
  {/if}

  <!-- Two-column main area -->
  <div class="flex flex-1 min-h-0">
    <!-- Left column: prompt + actions -->
    <div class="flex w-80 shrink-0 flex-col border-r">
      <textarea
        id="ai-prompt"
        class="flex-1 resize-none border-0 bg-background p-3 text-sm focus:outline-none"
        placeholder={is_ask_mode
          ? "Ask a question about the note… (⌘↵ to run)"
          : "Describe how you want to edit the note… (⌘↵ to run)"}
        value={prompt}
        oninput={(event) => on_prompt_change(event.currentTarget.value)}
        onkeydown={handle_prompt_keydown}
        disabled={is_executing || cli_status === "unavailable"}
      ></textarea>
      <div class="flex flex-wrap items-center gap-2 border-t px-3 py-2">
        <Button variant="ghost" size="sm" onclick={on_close}
          >{close_label}</Button
        >
        {#if result}
          <Button variant="ghost" size="sm" onclick={on_clear_result}>
            {result_is_answer ? "Dismiss" : "Dismiss Draft"}
          </Button>
        {/if}
        {#if result?.success && result_is_answer}
          <Button variant="ghost" size="sm" onclick={copy_result}>
            {copied ? "Copied" : "Copy"}
          </Button>
        {/if}
        <div class="flex-1"></div>
        {#if result?.success && !result_is_answer}
          <Button
            size="sm"
            onclick={apply_current_selection}
            disabled={draft_diff ? selected_hunk_ids.length === 0 : false}
          >
            {#if partial_selection_active}
              Apply Selected
            {:else}
              {target === "selection" ? "Apply to Selection" : "Replace Note"}
            {/if}
          </Button>
        {/if}
        <Button size="sm" onclick={on_execute} disabled={execute_disabled}>
          {#if is_executing}
            Running…
          {:else if result}
            {is_ask_mode ? "Ask Again" : "Refine Draft"}
          {:else}
            {is_ask_mode ? "Ask" : "Generate Draft"}
          {/if}
        </Button>
      </div>
    </div>

    <!-- Right column: context preview / result -->
    <div class="flex min-w-0 flex-1 flex-col overflow-y-auto p-3">
      {#if result}
        {#if result.success}
          {#if result_is_answer}
            <div class="space-y-3">
              <div
                class="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
              >
                Answer from
                <span class="ml-1 text-foreground">
                  {provider_config?.name ?? "AI"}
                </span>
              </div>
              <div
                class="whitespace-pre-wrap rounded-md border bg-background px-4 py-3 text-sm"
              >
                {result.output}
              </div>
            </div>
          {:else}
            <div class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div
                  class="min-w-0 flex-1 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
                >
                  Review the generated content before applying.
                  <span class="ml-1 text-foreground">
                    Backend: {provider_config?.name ?? "AI"}
                  </span>
                </div>
                {#if draft_diff}
                  <div class="flex shrink-0 items-center gap-2 text-xs">
                    <span
                      class="rounded-md border px-2 py-1 text-emerald-700 dark:text-emerald-400"
                    >
                      +{draft_diff.additions}
                    </span>
                    <span class="rounded-md border px-2 py-1 text-destructive">
                      -{draft_diff.deletions}
                    </span>
                  </div>
                {/if}
              </div>
              {#if draft_diff && draft_diff.hunks.length > 1}
                <div
                  class="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground"
                >
                  Select the change groups you want to apply. Unselected hunks
                  keep the original note content.
                </div>
              {/if}
              <AiDiffView
                diff={draft_diff}
                {selected_hunk_ids}
                on_toggle_hunk={draft_diff && draft_diff.hunks.length > 1
                  ? toggle_hunk
                  : undefined}
                on_select_all={draft_diff && draft_diff.hunks.length > 1
                  ? select_all_hunks
                  : undefined}
                on_clear_selection={draft_diff && draft_diff.hunks.length > 1
                  ? clear_hunk_selection
                  : undefined}
              />
            </div>
          {/if}
        {:else}
          <div
            class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {result.error ?? `${provider_config?.name ?? "AI"} failed.`}
          </div>
        {/if}

        {#if history_turns.length > 0}
          <div class="mt-4 space-y-3">
            <div class="text-sm font-medium">Session History</div>
            <div class="space-y-3">
              {#each history_turns as turn (turn.id)}
                <div class="space-y-2 rounded-md border bg-muted/20 p-3">
                  <div class="text-xs font-medium text-muted-foreground">
                    You ·
                    {turn.mode === "ask" ? "Ask" : "Edit"} ·
                    {turn.target === "selection" ? "Selection" : "Full Note"} ·
                    {providers.find((p) => p.id === turn.provider_id)?.name ??
                      turn.provider_id}
                  </div>
                  <p class="whitespace-pre-wrap text-sm">{turn.prompt}</p>
                  <div class="text-xs font-medium text-muted-foreground">
                    Assistant
                  </div>
                  {#if turn.status === "pending"}
                    <p class="text-sm text-muted-foreground">
                      {turn.mode === "ask" ? "Thinking…" : "Generating draft…"}
                    </p>
                  {:else if turn.result?.success}
                    <p
                      class="line-clamp-6 whitespace-pre-wrap font-mono text-xs text-muted-foreground"
                    >
                      {turn.result.output}
                    </p>
                  {:else}
                    <p class="whitespace-pre-wrap text-sm text-destructive">
                      {turn.result?.error ?? "Assistant run failed."}
                    </p>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <!-- Context preview (no result yet) -->
        <div
          class="space-y-3 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0 flex-1 space-y-1">
              <p>
                Sending the
                <span class="font-medium text-foreground">
                  {target === "selection" ? "selected text" : "full note"}
                </span>
                to {provider_config?.name ?? "AI"}.
              </p>
              <p class="text-xs">
                {context_preview.note_label}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              class="shrink-0 whitespace-nowrap"
              onclick={() => (context_preview_open = !context_preview_open)}
            >
              {context_preview_open ? "Hide Payload" : "Show Payload"}
            </Button>
          </div>
          <div class="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <div class="rounded-md border bg-background/60 px-2 py-1">
              <span class="font-medium text-foreground"
                >{context_preview.scope_label}</span
              >
            </div>
            <div class="rounded-md border bg-background/60 px-2 py-1">
              <span class="font-medium text-foreground"
                >{context_preview.line_count}</span
              >
              lines
            </div>
            <div class="rounded-md border bg-background/60 px-2 py-1">
              <span class="font-medium text-foreground"
                >{context_preview.char_count}</span
              >
              chars
            </div>
          </div>
          {#if !context_preview_open && target === "selection" && selection_preview}
            <p
              class="line-clamp-4 whitespace-pre-wrap font-mono text-xs text-muted-foreground"
            >
              {selection_preview}
            </p>
          {/if}
          {#if context_preview_open}
            <div class="space-y-2">
              <p class="text-xs font-medium text-foreground">
                {context_preview.payload_label}
              </p>
              <textarea
                class="min-h-40 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                readonly
                value={original_text}
              ></textarea>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
