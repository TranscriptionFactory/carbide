<script lang="ts">
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import EmptyMessage from "$lib/components/ui/empty_message.svelte";
  import type { AssistantSession } from "$lib/features/assistant/types/session";

  interface Props {
    session: AssistantSession | null;
  }

  let { session }: Props = $props();

  // tool-call replay messages are persisted for the agent loop, not shown
  const visible_messages = $derived(
    (session?.messages ?? []).filter((message) => message.role !== "tool"),
  );
</script>

<div class="AssistantSessionTabView" data-testid="assistant-session-tab">
  {#if !session}
    <EmptyMessage
      icon={MessagesSquare}
      text="This conversation is no longer available"
      hint="Older sessions are cleared automatically. Start a new conversation to pick the thread back up."
    />
  {:else}
    <header class="AssistantSessionTabView__header">
      <h1
        class="AssistantSessionTabView__title"
        data-testid="assistant-session-title"
      >
        {session.title}
      </h1>
      <p class="AssistantSessionTabView__meta">
        <span data-testid="assistant-session-kind">{session.kind}</span>
        <span aria-hidden="true">·</span>
        <span>{session.provider_id}</span>
      </p>
    </header>

    {#if visible_messages.length === 0}
      <EmptyMessage
        icon={MessagesSquare}
        text="No messages yet"
        hint="This conversation has not started."
      />
    {:else}
      <ol class="AssistantSessionTabView__transcript">
        {#each visible_messages as message (message.id)}
          <li
            class="AssistantSessionTabView__message"
            data-testid="assistant-session-message"
            data-role={message.role}
          >
            <span class="AssistantSessionTabView__role">{message.role}</span>
            <div class="AssistantSessionTabView__content">
              {message.content}
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</div>

<style>
  .AssistantSessionTabView {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4);
    gap: var(--space-4);
  }

  .AssistantSessionTabView__header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  .AssistantSessionTabView__title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--foreground);
  }

  .AssistantSessionTabView__meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .AssistantSessionTabView__transcript {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    list-style: none;
  }

  .AssistantSessionTabView__message {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .AssistantSessionTabView__role {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--muted-foreground);
    text-transform: capitalize;
  }

  .AssistantSessionTabView__content {
    font-size: var(--text-sm);
    color: var(--foreground);
    white-space: pre-wrap;
  }
</style>
