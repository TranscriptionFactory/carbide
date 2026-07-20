<script lang="ts">
  import type { Component, Snippet } from "svelte";

  let {
    icon: Icon,
    text,
    hint,
    children,
  }: {
    icon?: Component;
    text: string;
    hint?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="EmptyMessage" data-testid="empty-message">
  {#if Icon}<Icon class="EmptyMessage__icon" />{/if}
  <p class="EmptyMessage__text">{text}</p>
  {#if hint}<p class="EmptyMessage__hint">{hint}</p>{/if}
  {#if children}{@render children()}{/if}
</div>

<style>
  .EmptyMessage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-8) var(--space-4);
    text-align: center;
  }

  .EmptyMessage__text {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .EmptyMessage__hint {
    font-size: var(--text-xs);
    color: var(--foreground-tertiary);
  }

  .EmptyMessage :global(.EmptyMessage__icon) {
    width: var(--size-icon-lg);
    height: var(--size-icon-lg);
    color: var(--foreground-tertiary);
  }
</style>
