<script lang="ts">
  import { LinksPanel } from "$lib/features/links";
  import { OutlinePanel } from "$lib/features/outline";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  const { stores } = use_app_context();

  const active_tab = $derived(
    stores.ui.context_rail_tab === "outline" ? "outline" : "links",
  );

  function select_tab(tab_id: "links" | "outline") {
    stores.ui.set_context_rail_tab(tab_id);
  }
</script>

<div class="ContextRail">
  <div class="ContextRail__tabs">
    <button
      type="button"
      class="ContextRail__tab"
      class:ContextRail__tab--active={active_tab === "links"}
      onclick={() => select_tab("links")}
    >
      Links
    </button>
    <button
      type="button"
      class="ContextRail__tab"
      class:ContextRail__tab--active={active_tab === "outline"}
      onclick={() => select_tab("outline")}
    >
      Outline
    </button>
  </div>
  <div class="ContextRail__panel">
    {#if active_tab === "links"}
      <LinksPanel />
    {:else}
      <div data-vim-nav-region="outline" tabindex="-1" class="h-full">
        <OutlinePanel />
      </div>
    {/if}
  </div>
</div>

<style>
  .ContextRail {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    border-inline-start: 1px solid var(--border);
  }

  .ContextRail__tabs {
    display: flex;
    align-items: center;
    height: var(--size-touch-lg);
    border-block-end: 1px solid var(--border);
    padding-inline: 0;
    flex-shrink: 0;
  }

  .ContextRail__tab {
    display: flex;
    align-items: center;
    height: 100%;
    padding-inline: var(--space-3);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    border-block-end: 2px solid transparent;
    transition:
      color var(--duration-fast) var(--ease-default),
      border-color var(--duration-fast) var(--ease-default);
  }

  .ContextRail__tab:hover {
    color: var(--foreground);
  }

  .ContextRail__tab--active {
    color: var(--interactive);
    border-block-end-color: var(--interactive);
  }

  .ContextRail__panel {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding-block-start: var(--space-2);
  }
</style>
