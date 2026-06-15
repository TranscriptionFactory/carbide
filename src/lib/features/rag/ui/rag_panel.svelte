<script lang="ts">
  import {
    MessagesSquare,
    Loader2,
    AlertCircle,
    SquarePen,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import RagMessage from "$lib/features/rag/ui/rag_message.svelte";
  import RagInput from "$lib/features/rag/ui/rag_input.svelte";
  import type { RagScope } from "$lib/features/rag/domain/rag_types";

  const { stores, action_registry } = use_app_context();

  const rag = stores.rag;
  const providers = $derived(stores.ui.editor_settings.ai_providers);
  const provider_id = $derived(
    rag.provider_id ||
      stores.ui.editor_settings.ai_default_provider_id ||
      (providers[0]?.id ?? ""),
  );

  const last_question = $derived(
    rag.messages.findLast((m) => m.role === "user")?.content ?? "",
  );

  const EXAMPLES = [
    "What did I write about this week?",
    "Summarize my notes on this project.",
    "What are the open questions in my vault?",
  ];

  function ask(question: string) {
    void action_registry.execute(ACTION_IDS.rag_ask, question);
  }

  function change_provider(id: string) {
    rag.set_provider(id);
  }

  function change_scope(scope: RagScope) {
    rag.set_scope(scope);
  }

  function new_chat() {
    void action_registry.execute(ACTION_IDS.rag_new_chat);
  }
</script>

<div class="flex h-full flex-col">
  {#if rag.messages.length > 0}
    <div class="flex items-center justify-between border-b px-3 py-1.5">
      <span class="text-xs font-medium text-muted-foreground">Vault Chat</span>
      <Button variant="ghost" size="sm" class="h-7 gap-1.5" onclick={new_chat}>
        <SquarePen class="size-3.5" />
        New chat
      </Button>
    </div>
  {/if}

  <div class="flex-1 overflow-y-auto p-3">
    {#if rag.messages.length === 0 && !rag.is_loading}
      <div
        class="flex h-full flex-col items-center justify-center gap-3 text-center"
      >
        <MessagesSquare class="size-8 text-muted-foreground" />
        <div class="text-sm font-medium">Ask anything about your vault</div>
        <div class="flex flex-col gap-1">
          {#each EXAMPLES as example (example)}
            <button
              type="button"
              class="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onclick={() => ask(example)}
            >
              {example}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="flex flex-col gap-4">
        {#each rag.messages as message (message.id)}
          <RagMessage
            {message}
            is_streaming={message.id === rag.streaming_id}
          />
        {/each}

        {#if rag.is_loading}
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 class="size-4 animate-spin" />
            Searching your vault…
          </div>
        {/if}

        {#if rag.error}
          <div
            class="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"
          >
            <div class="flex items-center gap-2 text-destructive">
              <AlertCircle class="size-4" />
              {rag.error}
            </div>
            {#if last_question}
              <Button
                variant="outline"
                size="sm"
                class="self-start"
                onclick={() => ask(last_question)}
              >
                Retry
              </Button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <RagInput
    {providers}
    {provider_id}
    scope={rag.scope}
    is_loading={rag.is_loading}
    on_submit={ask}
    on_provider_change={change_provider}
    on_scope_change={change_scope}
  />
</div>
