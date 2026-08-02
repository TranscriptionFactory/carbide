<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import OmnibarModeSegment from "$lib/features/search/ui/omnibar_mode_segment.svelte";
  import type { OmnibarAskView } from "$lib/features/search/types/omnibar_ask";

  type Props = OmnibarAskView & {
    on_mode_change: (ask_mode: boolean) => void;
  };

  let {
    draft,
    session,
    status,
    error,
    can_insert,
    provider_label,
    on_draft_change,
    on_mode_change,
    on_submit,
    on_insert,
    on_promote,
    on_dismiss,
  }: Props = $props();

  let input_ref: HTMLInputElement | null = $state(null);

  const answer = $derived(
    session?.messages.findLast((message) => message.role === "assistant") ??
      null,
  );
  const has_answer = $derived((answer?.content ?? "") !== "");
  const citations = $derived(answer?.citations ?? []);

  function handle_keydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      on_dismiss();
      return;
    }
    if (event.key !== "Enter") return;

    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      if (can_insert && has_answer) on_insert();
      return;
    }
    if (has_answer) {
      on_promote();
      return;
    }
    on_submit();
  }

  $effect(() => {
    setTimeout(() => input_ref?.focus(), 0);
  });
</script>

<div class="OmnibarAsk" data-testid="omnibar-ask">
  <div class="OmnibarAsk__input">
    <span
      class="OmnibarAsk__presence"
      class:OmnibarAsk__presence--streaming={status === "running"}
    >
      <SparklesIcon />
    </span>
    <Input
      bind:ref={input_ref}
      type="text"
      placeholder="Ask about your vault…"
      value={draft}
      oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
        on_draft_change(event.currentTarget.value);
      }}
      onkeydown={handle_keydown}
      spellcheck="false"
      autocorrect="off"
      autocapitalize="off"
      autocomplete="off"
      data-testid="omnibar-ask-input"
      class="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
    />
    <OmnibarModeSegment ask_mode={true} {on_mode_change} />
  </div>

  {#if status === "error" && error}
    <p class="OmnibarAsk__error" role="alert" data-testid="omnibar-ask-error">
      {error}
    </p>
  {:else if has_answer}
    <div class="OmnibarAsk__answer">
      <p class="OmnibarAsk__body" data-testid="omnibar-ask-answer">
        {answer?.content}
      </p>
      {#if citations.length > 0}
        <ul class="OmnibarAsk__cites" data-testid="omnibar-ask-citations">
          {#each citations as citation (citation.index)}
            <li>
              <span class="OmnibarAsk__cite-index">[{citation.index}]</span>
              {citation.title}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else if status === "running"}
    <p class="OmnibarAsk__pending">Searching your vault…</p>
  {/if}

  <div class="OmnibarAsk__foot">
    {#if has_answer}
      <span><kbd>↵</kbd> Continue in chat</span>
      {#if can_insert}
        <span><kbd>⌘↵</kbd> Insert at cursor</span>
      {/if}
    {:else}
      <span><kbd>↵</kbd> Ask</span>
    {/if}
    <span><kbd>esc</kbd> {status === "running" ? "Stop" : "Dismiss"}</span>
    <span class="OmnibarAsk__provider">{provider_label}</span>
  </div>
</div>

<style>
  .OmnibarAsk__input {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-inline: var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  .OmnibarAsk__presence {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  .OmnibarAsk__presence--streaming {
    color: var(--interactive);
    animation: OmnibarAsk__pulse 1.2s ease-in-out infinite;
  }

  :global(.OmnibarAsk__presence svg) {
    width: var(--size-icon);
    height: var(--size-icon);
  }

  .OmnibarAsk__answer,
  .OmnibarAsk__pending,
  .OmnibarAsk__error {
    padding: var(--space-3);
    font-size: var(--text-sm);
  }

  .OmnibarAsk__pending,
  .OmnibarAsk__error {
    color: var(--muted-foreground);
  }

  .OmnibarAsk__error {
    color: var(--destructive);
  }

  .OmnibarAsk__body {
    color: var(--foreground);
    white-space: pre-wrap;
  }

  .OmnibarAsk__cites {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .OmnibarAsk__cite-index {
    color: var(--interactive);
  }

  .OmnibarAsk__foot {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--border);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .OmnibarAsk__provider {
    margin-left: auto;
  }

  @keyframes OmnibarAsk__pulse {
    50% {
      opacity: 0.4;
    }
  }
</style>
