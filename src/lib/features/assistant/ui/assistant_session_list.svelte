<script lang="ts">
  import { ChevronDown, ChevronRight } from "@lucide/svelte";
  import AssistantSessionKindFilter from "./assistant_session_kind_filter.svelte";
  import AssistantSessionRow from "./assistant_session_row.svelte";
  import type {
    AssistantSessionKind,
    AssistantSessionSummary,
  } from "$lib/features/assistant/types/session";

  type KindFilter = AssistantSessionKind | "all";

  interface Props {
    sessions: AssistantSessionSummary[];
    active_id?: string | null;
    on_open: (id: string) => void;
    on_rename: (id: string, title: string) => void;
    on_delete: (id: string) => void;
    now?: () => number;
  }

  let {
    sessions,
    active_id = null,
    on_open,
    on_rename,
    on_delete,
    now = () => Date.now(),
  }: Props = $props();

  const EMPTY_TEXT: Record<KindFilter, string> = {
    all: "No sessions yet",
    inline: "No inline sessions yet",
    note: "No note sessions yet",
    chat: "No chat sessions yet",
  };

  let filter = $state<KindFilter>("all");
  let inline_expanded = $state(false);
  let renaming_id = $state<string | null>(null);
  let rename_draft = $state("");

  const now_ms = $derived(now());

  const matching = $derived(
    sessions
      .filter((session) => filter === "all" || session.kind === filter)
      .sort((a, b) => b.updated_at - a.updated_at),
  );

  // Inline sessions are grouped only when they would otherwise be noise among
  // the other kinds (R3); under their own filter they are the whole list.
  const groups_inline = $derived(filter === "all");

  const rows = $derived(
    groups_inline
      ? matching.filter((session) => session.kind !== "inline")
      : matching,
  );

  const inline_rows = $derived(
    groups_inline
      ? matching.filter((session) => session.kind === "inline")
      : [],
  );

  function select_filter(kind: KindFilter) {
    filter = kind;
    renaming_id = null;
  }

  function begin_rename(id: string) {
    renaming_id = id;
    rename_draft = sessions.find((session) => session.id === id)?.title ?? "";
  }

  function commit_rename(id: string, title: string) {
    const next = title.trim();
    if (next === "") return;
    on_rename(id, next);
    renaming_id = null;
  }

  function cancel_rename() {
    renaming_id = null;
  }
</script>

{#snippet session_row(session: AssistantSessionSummary)}
  <AssistantSessionRow
    {session}
    active={session.id === active_id}
    renaming={renaming_id === session.id}
    draft={rename_draft}
    {now_ms}
    {on_open}
    {on_delete}
    on_begin_rename={begin_rename}
    on_draft_change={(title) => (rename_draft = title)}
    on_commit_rename={commit_rename}
    on_cancel_rename={cancel_rename}
  />
{/snippet}

<div class="flex flex-col" data-testid="assistant-session-list">
  <AssistantSessionKindFilter selected={filter} on_select={select_filter} />

  {#if rows.length === 0 && inline_rows.length === 0}
    <p
      class="px-3 py-2 text-xs text-muted-foreground"
      data-testid="assistant-session-empty"
    >
      {EMPTY_TEXT[filter]}
    </p>
  {:else}
    <div class="flex flex-col gap-0.5 px-2 pb-2">
      {#each rows as session (session.id)}
        {@render session_row(session)}
      {/each}
    </div>

    {#if inline_rows.length > 0}
      <div class="border-t" data-testid="assistant-inline-group">
        <button
          type="button"
          class="flex w-full items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          data-testid="assistant-inline-group-toggle"
          aria-expanded={inline_expanded}
          onclick={() => (inline_expanded = !inline_expanded)}
        >
          {#if inline_expanded}
            <ChevronDown class="size-3.5 shrink-0" />
          {:else}
            <ChevronRight class="size-3.5 shrink-0" />
          {/if}
          <span>⌁ Inline · {inline_rows.length}</span>
        </button>

        {#if inline_expanded}
          <div class="flex flex-col gap-0.5 px-2 pb-2">
            {#each inline_rows as session (session.id)}
              {@render session_row(session)}
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
