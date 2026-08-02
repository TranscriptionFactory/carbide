<script lang="ts">
  import { Check, Pencil, Trash2, X } from "@lucide/svelte";
  import { Input } from "$lib/components/ui/input";
  import { format_relative_time } from "$lib/shared/utils/relative_time";
  import type {
    AssistantSessionKind,
    AssistantSessionSummary,
  } from "$lib/features/assistant/types/session";

  interface Props {
    session: AssistantSessionSummary;
    active: boolean;
    renaming: boolean;
    draft: string;
    now_ms: number;
    on_open: (id: string) => void;
    on_delete: (id: string) => void;
    on_begin_rename: (id: string) => void;
    on_draft_change: (title: string) => void;
    on_commit_rename: (id: string, title: string) => void;
    on_cancel_rename: () => void;
  }

  let {
    session,
    active,
    renaming,
    draft,
    now_ms,
    on_open,
    on_delete,
    on_begin_rename,
    on_draft_change,
    on_commit_rename,
    on_cancel_rename,
  }: Props = $props();

  const KIND_GLYPHS: Record<AssistantSessionKind, string> = {
    inline: "⌁",
    note: "▤",
    chat: "◈",
  };

  function rename_keydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      on_commit_rename(session.id, draft);
    } else if (event.key === "Escape") {
      event.preventDefault();
      on_cancel_rename();
    }
  }
</script>

<div
  class="group flex items-center gap-2 rounded-md px-2 py-1 text-sm {active
    ? 'bg-accent text-accent-foreground'
    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
  data-testid="assistant-session-row"
  data-session-id={session.id}
  data-kind={session.kind}
  aria-current={active ? "true" : undefined}
>
  <span
    class="w-3 shrink-0 text-center text-primary"
    data-testid="assistant-session-kind"
    aria-hidden="true">{KIND_GLYPHS[session.kind]}</span
  >

  {#if renaming}
    <Input
      value={draft}
      class="h-7 text-xs"
      data-testid="assistant-session-rename-input"
      aria-label="Rename {session.title}"
      oninput={(event) => {
        on_draft_change(event.currentTarget.value);
      }}
      onkeydown={rename_keydown}
    />
    <button
      type="button"
      class="shrink-0 text-muted-foreground hover:text-foreground"
      data-testid="assistant-session-rename-commit"
      aria-label="Save title for {session.title}"
      onclick={() => {
        on_commit_rename(session.id, draft);
      }}
    >
      <Check class="size-3.5" />
    </button>
    <button
      type="button"
      class="shrink-0 text-muted-foreground hover:text-foreground"
      data-testid="assistant-session-rename-cancel"
      aria-label="Cancel renaming {session.title}"
      onclick={on_cancel_rename}
    >
      <X class="size-3.5" />
    </button>
  {:else}
    <button
      type="button"
      class="min-w-0 flex-1 truncate text-left"
      data-testid="assistant-session-open"
      aria-label="Open {session.title}"
      onclick={() => {
        on_open(session.id);
      }}
    >
      {session.title}
    </button>
    <span
      class="shrink-0 text-xs text-muted-foreground"
      data-testid="assistant-session-when"
      >{format_relative_time(session.updated_at, now_ms)}</span
    >
    <button
      type="button"
      class="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
      data-testid="assistant-session-rename"
      aria-label="Rename {session.title}"
      onclick={() => {
        on_begin_rename(session.id);
      }}
    >
      <Pencil class="size-3.5" />
    </button>
    <button
      type="button"
      class="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
      data-testid="assistant-session-delete"
      aria-label="Delete {session.title}"
      onclick={() => {
        on_delete(session.id);
      }}
    >
      <Trash2 class="size-3.5" />
    </button>
  {/if}
</div>
