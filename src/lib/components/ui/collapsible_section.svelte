<script lang="ts">
  import { ChevronDown, ChevronRight } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    count?: number;
    open: boolean;
    action_label?: string;
    on_toggle: () => void;
    on_action?: () => void;
    children: Snippet;
  };

  let {
    title,
    count,
    open,
    action_label,
    on_toggle,
    on_action,
    children,
  }: Props = $props();
</script>

<div class="CollapsibleSection">
  <div class="CollapsibleSection__header">
    <button
      type="button"
      class="CollapsibleSection__toggle"
      onclick={on_toggle}
    >
      {#if open}
        <ChevronDown class="CollapsibleSection__chevron" />
      {:else}
        <ChevronRight class="CollapsibleSection__chevron" />
      {/if}
      <span>
        {title}{#if count != null}&nbsp;({count}){/if}
      </span>
    </button>
    {#if action_label && on_action}
      <button
        type="button"
        class="CollapsibleSection__action"
        onclick={on_action}
        aria-label={action_label}
      >
        {action_label}
      </button>
    {/if}
  </div>
  {#if open}
    {@render children()}
  {/if}
</div>

<style>
  .CollapsibleSection {
    border-block-end: 1px solid var(--border);
  }

  .CollapsibleSection__header {
    display: flex;
    align-items: center;
    padding-inline-end: var(--space-2);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .CollapsibleSection__header:hover {
    background-color: var(--accent);
  }

  .CollapsibleSection__toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex: 1;
    padding: var(--space-1-5) var(--space-2);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--foreground);
    text-align: start;
  }

  :global(.CollapsibleSection__chevron) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    opacity: 0.5;
  }

  .CollapsibleSection__action {
    margin-inline-start: auto;
    font-size: var(--text-2xs);
    font-weight: 400;
    color: var(--interactive);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .CollapsibleSection__header:hover .CollapsibleSection__action {
    opacity: 1;
  }
</style>
