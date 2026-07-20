<script lang="ts">
  import LinksPanel from "$lib/features/links/ui/links_panel.svelte";
  import RelatedPanel from "$lib/features/links/ui/related_panel.svelte";
  import { OutlinePanel } from "$lib/features/outline";
  import { MetadataPanel } from "$lib/features/metadata";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  const { stores } = use_app_context();

  const outline_docked = $derived(
    stores.ui.editor_settings.outline_mode === "docked",
  );
</script>

<div class="ContextRailPanel" data-testid="context-rail-panel">
  {#if stores.ui.context_rail_tab === "links"}
    <LinksPanel />
  {:else if stores.ui.context_rail_tab === "outline" && !outline_docked}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div data-vim-nav-region="outline" tabindex="-1" class="h-full">
      <OutlinePanel />
    </div>
  {:else if stores.ui.context_rail_tab === "metadata"}
    <MetadataPanel />
  {:else if stores.ui.context_rail_tab === "related"}
    <RelatedPanel />
  {/if}
</div>

<style>
  .ContextRailPanel {
    height: 100%;
    background-color: var(--background);
    box-shadow: inset 1px 0 0 var(--border);
    overflow: hidden;
    padding-block-start: var(--space-2);
  }
</style>
