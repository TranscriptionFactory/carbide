<script lang="ts">
  import { ChevronDown, ChevronRight } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    count?: number;
    open: boolean;
    action_label?: string | undefined;
    destructive_action_label?: string | undefined;
    on_toggle: () => void;
    on_action?: (() => void) | undefined;
    on_destructive_action?: (() => void) | undefined;
    children: Snippet;
  };

  let {
    title,
    count,
    open,
    action_label,
    destructive_action_label,
    on_toggle,
    on_action,
    on_destructive_action,
    children,
  }: Props = $props();

  let has_toggled = $state(false);

  function handle_toggle() {
    has_toggled = true;
    on_toggle();
  }
</script>

<div class="CollapsibleSection">
  <div class="CollapsibleSection__header">
    <button
      type="button"
      class="CollapsibleSection__toggle"
      onclick={handle_toggle}
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
    {#if destructive_action_label && on_destructive_action}
      <button
        type="button"
        class="CollapsibleSection__action CollapsibleSection__action--destructive"
        onclick={on_destructive_action}
        aria-label={destructive_action_label}
      >
        {destructive_action_label}
      </button>
    {/if}
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
  <div
    class="CollapsibleSection__content"
    class:CollapsibleSection__content--closed={!open}
    class:animate-collapsible-down={has_toggled && open}
    class:animate-collapsible-up={has_toggled && !open}
  >
    {@render children()}
  </div>
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

  .CollapsibleSection__action + .CollapsibleSection__action {
    margin-inline-start: var(--space-2);
  }

  .CollapsibleSection__action--destructive {
    color: var(--destructive);
  }

  .CollapsibleSection__header:hover .CollapsibleSection__action {
    opacity: 1;
  }

  .CollapsibleSection__content {
    overflow: hidden;
  }

  .CollapsibleSection__content--closed {
    max-height: 0;
    opacity: 0;
    visibility: hidden;
  }
</style>
