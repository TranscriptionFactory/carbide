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
    FileText,
    X,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import CollapsibleSection from "$lib/components/ui/collapsible_section.svelte";
  import EmptyMessage from "$lib/components/ui/empty_message.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import RagMessage from "$lib/features/rag/ui/rag_message.svelte";
  import RagInput from "$lib/features/rag/ui/rag_input.svelte";
  import RagModeToggle from "$lib/features/rag/ui/rag_mode_toggle.svelte";
  import { provider_supports_agent } from "$lib/features/ai";
  import type {
    RagScope,
    RagSessionMode,
  } from "$lib/features/rag/domain/rag_types";
  import type { AgentPermissionMode } from "$lib/features/rag/types/agent_events";
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

  // tool-call replay messages are persisted for the native agent loop, not shown
  const visible_messages = $derived(
    rag.messages.filter((m) => m.role !== "tool"),
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
    // provider changes re-arm the poll alongside vault switches
    void rag.provider_id;
    rag.set_readiness({ state: "checking" });
    if (!vault_id) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const stop_polling = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    // poll only while not ready; ready is stable until vault/provider change
    const refresh = async () => {
      const readiness = await services.rag.check_readiness();
      if (cancelled) return;
      rag.set_readiness(readiness);
      if (readiness.state === "ready") {
        stop_polling();
      } else if (interval === null) {
        interval = setInterval(() => void refresh(), READINESS_POLL_MS);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      stop_polling();
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

  const MENTION_SUGGEST_LIMIT = 8;

  async function suggest_notes(
    partial: string,
  ): Promise<Array<{ path: string; title: string }>> {
    const result = await services.search.suggest_wiki_links(partial);
    const notes: Array<{ path: string; title: string }> = [];
    for (const suggestion of result.results) {
      if (suggestion.kind !== "existing") continue;
      notes.push({
        path: suggestion.note.path,
        title: suggestion.note.title,
      });
      if (notes.length === MENTION_SUGGEST_LIMIT) break;
    }
    return notes;
  }

  let sources_open = $state(false);
  // statement form: the vite ssr transform drops the parens in
  // `a && (b || c)`, evaluating `c` even when the guard fails
  const show_pending_sources = $derived.by(() => {
    if (rag.loading_stage !== "generating") return false;
    if (rag.pending_sources === null) return false;
    return rag.is_loading || rag.streaming_id !== null;
  });

  $effect(() => {
    if (rag.pending_sources === null) sources_open = false;
  });

  function open_source(note_path: string) {
    void action_registry.execute(ACTION_IDS.rag_open_citation, note_path);
  }

  function stop() {
    void action_registry.execute(
      rag.mode === "agent" ? ACTION_IDS.rag_agent_abort : ACTION_IDS.rag_stop,
    );
  }

  const agent_supported = $derived.by(() => {
    const config = providers.find((p) => p.id === provider_id);
    return config !== undefined && provider_supports_agent(config);
  });

  function set_mode(mode: RagSessionMode) {
    void action_registry.execute(ACTION_IDS.rag_set_mode, mode);
  }

  function set_permission_mode(mode: AgentPermissionMode) {
    void action_registry.execute(ACTION_IDS.rag_set_permission_mode, mode);
  }

  const last_assistant_id = $derived(
    rag.messages.findLast((m) => m.role === "assistant")?.id ?? null,
  );
  const changed_files = $derived(rag.active?.changed_files ?? []);

  const provider_name = $derived(
    providers.find((p) => p.id === provider_id)?.name ?? "the AI provider",
  );

  function persist_active_session() {
    const vault_id = stores.vault.vault?.id;
    const session = rag.active;
    if (!vault_id || !session) return;
    void services.rag.save_session(vault_id, session);
  }

  function change_provider(id: string) {
    rag.set_provider(id);
    const config = providers.find((p) => p.id === id);
    if (rag.mode === "agent" && !(config && provider_supports_agent(config))) {
      set_mode("ask");
    }
    persist_active_session();
  }

  function change_scope(scope: RagScope) {
    rag.set_scope(scope);
    persist_active_session();
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

{#snippet sources_strip()}
  {#if rag.pending_sources}
    <CollapsibleSection
      title="Sources"
      count={rag.pending_sources.length}
      open={sources_open}
      on_toggle={() => (sources_open = !sources_open)}
    >
      <div class="flex flex-col gap-0.5 pb-2">
        {#each rag.pending_sources as source (source.note_path)}
          <button
            type="button"
            class="flex items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            onclick={() => open_source(source.note_path)}
          >
            <FileText class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate">{source.title}</span>
            <span class="truncate text-muted-foreground"
              >{source.note_path}</span
            >
            {#if source.pinned}
              <span class="shrink-0 text-muted-foreground">pinned</span>
            {/if}
            {#if source.truncated}
              <span class="shrink-0 text-muted-foreground">truncated</span>
            {/if}
          </button>
        {/each}
      </div>
    </CollapsibleSection>
  {/if}
{/snippet}

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
  {:else if rag.readiness.state === "unavailable"}
    <div
      class="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
    >
      <AlertCircle class="size-3.5 shrink-0" />
      Couldn't check the vault index — answers may be incomplete ({rag.readiness
        .reason})
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
      {#if visible_messages.length === 0 && !rag.is_loading}
        <div class="flex h-full items-center justify-center">
          <EmptyMessage
            icon={MessagesSquare}
            text={rag.mode === "agent"
              ? "Agent edits files in your vault. Safe mode limits it to note tools."
              : "Ask anything about your vault"}
          >
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
          </EmptyMessage>
        </div>
      {:else}
        <div class="flex flex-col gap-4">
          {#each visible_messages as message (message.id)}
            {#if show_pending_sources && message.id === rag.streaming_id}
              {@render sources_strip()}
            {/if}
            <RagMessage
              {message}
              is_streaming={message.id === rag.streaming_id}
              changed_files={message.id === last_assistant_id &&
              changed_files.length > 0
                ? changed_files
                : undefined}
            />
          {/each}

          {#if show_pending_sources && rag.streaming_id === null}
            {@render sources_strip()}
          {/if}

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

  <RagModeToggle
    mode={rag.mode}
    permission_mode={rag.permission_mode}
    {agent_supported}
    on_set_mode={set_mode}
    on_set_permission_mode={set_permission_mode}
  />

  <RagInput
    {providers}
    {provider_id}
    {suggest_notes}
    scope={rag.scope}
    folder_paths={stores.notes.folder_paths}
    tags={stores.tag.tags}
    saved_views={stores.bases.saved_views}
    is_loading={rag.is_loading}
    is_streaming={rag.streaming_id !== null}
    readiness_state={rag.readiness.state}
    submit_label={rag.mode === "agent" ? "Run" : "Ask"}
    on_submit={ask}
    on_stop={stop}
    on_provider_change={change_provider}
    on_scope_change={change_scope}
  />
</div>
