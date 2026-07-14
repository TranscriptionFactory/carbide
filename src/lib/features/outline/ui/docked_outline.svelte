<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import OutlinePanel from "./outline_panel.svelte";
  import XIcon from "@lucide/svelte/icons/x";

  const { stores } = use_app_context();
</script>

<div class="DockedOutline">
  <div class="DockedOutline__header">
    <span class="DockedOutline__title">Outline</span>
    <button
      type="button"
      class="DockedOutline__close"
      onclick={() => (stores.ui.outline_docked_open = false)}
      title="Hide outline"
    >
      <XIcon />
    </button>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div data-vim-nav-region="outline" tabindex="-1" class="DockedOutline__body">
    <OutlinePanel />
  </div>
</div>

<style>
  .DockedOutline {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    border-inline-start: 1px solid var(--border);
  }

  .DockedOutline__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-block-end: 1px solid var(--border);
    flex-shrink: 0;
  }

  .DockedOutline__title {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
  }

  .DockedOutline__close {
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

  .DockedOutline__close:hover {
    color: var(--foreground);
    background-color: var(--accent);
  }

  :global(.DockedOutline__close svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .DockedOutline__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
