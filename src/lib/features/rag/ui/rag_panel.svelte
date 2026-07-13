<script lang="ts">
  import {
    MessagesSquare,
    Loader2,
    AlertCircle,
    SquarePen,
    History,
    Pencil,
    Trash2,
    Check,
    X,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import RagMessage from "$lib/features/rag/ui/rag_message.svelte";
  import RagInput from "$lib/features/rag/ui/rag_input.svelte";
  import type { RagScope } from "$lib/features/rag/domain/rag_types";
  import { RAG_TEMPLATES } from "$lib/features/rag/domain/rag_prompt_templates";

  const { stores, services, action_registry } = use_app_context();

  const READINESS_POLL_MS = 5000;

  const rag = stores.rag;
  const providers = $derived(stores.ui.editor_settings.ai_providers);
  const provider_id = $derived(
    rag.provider_id ||
      stores.ui.editor_settings.ai_default_provider_id ||
      (providers[0]?.id ?? ""),
  );
  const sessions = $derived(rag.summaries);

  const last_question = $derived(
    rag.messages.findLast((m) => m.role === "user")?.content ?? "",
  );

  let show_sessions = $state(false);
  let renaming_id = $state<string | null>(null);
  let rename_value = $state("");

  let listed_views_for: string | null = null;
  $effect(() => {
    const vault_id = stores.vault.vault?.id;
    if (!vault_id || vault_id === listed_views_for) return;
    listed_views_for = vault_id;
    if (stores.bases.saved_views.length === 0) {
      void action_registry.execute(ACTION_IDS.bases_list_views);
    }
  });

  $effect(() => {
    const vault_id = stores.vault.vault?.id;
    rag.set_readiness({ state: "checking" });
    if (!vault_id) return;
    let cancelled = false;
    const refresh = async () => {
      const readiness = await services.rag.check_readiness();
      if (!cancelled) rag.set_readiness(readiness);
    };
    void refresh();
    const interval = setInterval(refresh, READINESS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  });

  const templates = $derived(
    RAG_TEMPLATES.map((t) => ({
      id: t.id,
      label: t.label,
      query: t.build(rag.scope),
    })),
  );

  function ask(question: string) {
    void action_registry.execute(ACTION_IDS.rag_ask, question);
  }

  function stop() {
    void action_registry.execute(ACTION_IDS.rag_stop);
  }

  const provider_name = $derived(
    providers.find((p) => p.id === provider_id)?.name ?? "the AI provider",
  );

  function change_provider(id: string) {
    rag.set_provider(id);
  }

  function change_scope(scope: RagScope) {
    rag.set_scope(scope);
  }

  function new_chat() {
    show_sessions = false;
    void action_registry.execute(ACTION_IDS.rag_new_chat);
  }

  function switch_to(id: string) {
    show_sessions = false;
    void action_registry.execute(ACTION_IDS.rag_switch_session, id);
  }

  function remove_session(id: string) {
    void action_registry.execute(ACTION_IDS.rag_delete_session, id);
  }

  function begin_rename(id: string, title: string) {
    renaming_id = id;
    rename_value = title;
  }

  function cancel_rename() {
    renaming_id = null;
  }

  function commit_rename() {
    if (!renaming_id) return;
    void action_registry.execute(
      ACTION_IDS.rag_rename_session,
      renaming_id,
      rename_value,
    );
    renaming_id = null;
  }

  function rename_keydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit_rename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel_rename();
    }
  }
</script>

<div class="flex h-full flex-col">
  {#if sessions.length > 0 || rag.messages.length > 0}
    <div class="flex items-center justify-between border-b px-3 py-1.5">
      <div class="flex items-center gap-1">
        <span class="text-xs font-medium text-muted-foreground">Vault Chat</span
        >
        {#if sessions.length > 0}
          <Button
            variant="ghost"
            size="sm"
            class="h-7 gap-1.5 {show_sessions ? 'bg-accent' : ''}"
            onclick={() => (show_sessions = !show_sessions)}
          >
            <History class="size-3.5" />
            {sessions.length}
          </Button>
        {/if}
      </div>
      <Button variant="ghost" size="sm" class="h-7 gap-1.5" onclick={new_chat}>
        <SquarePen class="size-3.5" />
        New chat
      </Button>
    </div>
  {/if}

  {#if rag.readiness.state === "indexing"}
    <div
      class="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
    >
      <Loader2 class="size-3.5 shrink-0 animate-spin" />
      Indexing your vault — answers may be incomplete ({rag.readiness.embedded}
      of {rag.readiness.total} notes)
    </div>
  {/if}

  {#if show_sessions}
    <div class="flex-1 overflow-y-auto p-2">
      <div class="flex flex-col gap-0.5">
        {#each sessions as session (session.id)}
          <div
            class="group flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-accent {session.id ===
            rag.active_id
              ? 'bg-accent'
              : ''}"
          >
            {#if renaming_id === session.id}
              <Input
                value={rename_value}
                oninput={(event) => (rename_value = event.currentTarget.value)}
                onkeydown={rename_keydown}
                class="h-7 text-xs"
              />
              <Button
                variant="ghost"
                size="icon"
                class="size-6 shrink-0"
                onclick={commit_rename}
              >
                <Check class="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-6 shrink-0"
                onclick={cancel_rename}
              >
                <X class="size-3.5" />
              </Button>
            {:else}
              <button
                type="button"
                class="flex-1 truncate text-left"
                onclick={() => switch_to(session.id)}
              >
                {session.title}
              </button>
              <Button
                variant="ghost"
                size="icon"
                class="size-6 shrink-0 opacity-0 group-hover:opacity-100"
                onclick={() => begin_rename(session.id, session.title)}
              >
                <Pencil class="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-6 shrink-0 opacity-0 group-hover:opacity-100"
                onclick={() => remove_session(session.id)}
              >
                <Trash2 class="size-3.5" />
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="flex-1 overflow-y-auto p-3">
      {#if rag.messages.length === 0 && !rag.is_loading}
        <div
          class="flex h-full flex-col items-center justify-center gap-3 text-center"
        >
          <MessagesSquare class="size-8 text-muted-foreground" />
          <div class="text-sm font-medium">Ask anything about your vault</div>
          <div class="flex flex-wrap justify-center gap-1">
            {#each templates as template (template.id)}
              <button
                type="button"
                class="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                title={template.query}
                onclick={() => ask(template.query)}
              >
                {template.label}
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
              {rag.loading_stage === "generating"
                ? `Waiting for ${provider_name}…`
                : "Searching your vault…"}
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
  {/if}

  <RagInput
    {providers}
    {provider_id}
    scope={rag.scope}
    folder_paths={stores.notes.folder_paths}
    tags={stores.tag.tags}
    saved_views={stores.bases.saved_views}
    is_loading={rag.is_loading}
    is_streaming={rag.streaming_id !== null}
    readiness_state={rag.readiness.state}
    on_submit={ask}
    on_stop={stop}
    on_provider_change={change_provider}
    on_scope_change={change_scope}
  />
</div>
