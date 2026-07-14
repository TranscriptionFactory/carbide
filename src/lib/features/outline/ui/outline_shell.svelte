<script lang="ts">
  import type { Snippet } from "svelte";
  import XIcon from "@lucide/svelte/icons/x";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";

  const {
    on_close,
    close_title,
    on_toggle,
    toggle_title,
    collapsed = false,
    nav_region,
    children,
  }: {
    on_close: () => void;
    close_title: string;
    on_toggle?: () => void;
    toggle_title?: string;
    collapsed?: boolean;
    nav_region?: string;
    children: Snippet;
  } = $props();
</script>

<div class="OutlineShell__header">
  {#if on_toggle}
    <button
      type="button"
      class="OutlineShell__button"
      onclick={on_toggle}
      title={toggle_title}
    >
      <ChevronsUpDown />
    </button>
  {/if}
  <span class="OutlineShell__title">Outline</span>
  <button
    type="button"
    class="OutlineShell__button"
    onclick={on_close}
    title={close_title}
  >
    <XIcon />
  </button>
</div>
{#if !collapsed}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="OutlineShell__body"
    data-vim-nav-region={nav_region}
    tabindex={nav_region ? -1 : undefined}
  >
    {@render children()}
  </div>
{/if}

<style>
  .OutlineShell__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-block-end: 1px solid var(--border);
    flex-shrink: 0;
  }

  .OutlineShell__title {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
  }

  .OutlineShell__button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
    border: none;
    background: none;
    cursor: pointer;
    color: var(--muted-foreground);
    border-radius: var(--radius-sm);
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .OutlineShell__button:hover {
    color: var(--foreground);
    background-color: var(--accent);
  }

  :global(.OutlineShell__button svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .OutlineShell__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
