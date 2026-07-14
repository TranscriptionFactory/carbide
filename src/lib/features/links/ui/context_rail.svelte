<script lang="ts">
  import { Link, List, Tags, Compass } from "@lucide/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import LinksPanel from "$lib/features/links/ui/links_panel.svelte";
  import RelatedPanel from "$lib/features/links/ui/related_panel.svelte";
  import { OutlinePanel } from "$lib/features/outline";
  import { MetadataPanel } from "$lib/features/metadata";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  const { stores } = use_app_context();

  const tabs = [
    { id: "links" as const, label: "Links", icon: Link },
    { id: "outline" as const, label: "Outline", icon: List },
    { id: "metadata" as const, label: "Meta", icon: Tags },
    { id: "related" as const, label: "Related", icon: Compass },
  ];

  function on_icon_click(id: (typeof tabs)[number]["id"]) {
    if (stores.ui.context_rail_open && stores.ui.context_rail_tab === id) {
      stores.ui.context_rail_open = false;
    } else {
      stores.ui.set_context_rail_tab(id);
    }
  }

  function on_window_pointerdown(e: PointerEvent) {
    if (!stores.ui.context_rail_open) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(".ContextRail") ||
      target.closest(".ProseMirror, .cm-editor, input, textarea") ||
      target.isContentEditable
    ) {
      return;
    }
    stores.ui.context_rail_open = false;
  }
</script>

<svelte:window onpointerdown={on_window_pointerdown} />

<div class="ContextRail">
  {#if stores.ui.context_rail_open}
    <div class="ContextRail__panel">
      {#if stores.ui.context_rail_tab === "links"}
        <LinksPanel />
      {:else if stores.ui.context_rail_tab === "outline"}
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
  {/if}

  <div class="ContextRail__icons">
    {#each tabs as tab (tab.id)}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class="ContextRail__icon-btn"
              class:ContextRail__icon-btn--active={stores.ui
                .context_rail_open && stores.ui.context_rail_tab === tab.id}
              onclick={() => on_icon_click(tab.id)}
              aria-pressed={stores.ui.context_rail_open &&
                stores.ui.context_rail_tab === tab.id}
              aria-label={tab.label}
            >
              <tab.icon size={18} />
            </button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="left">{tab.label}</Tooltip.Content>
      </Tooltip.Root>
    {/each}
  </div>
</div>

<style>
  .ContextRail {
    position: relative;
    display: flex;
    flex-direction: row;
    height: 100%;
  }

  .ContextRail__icons {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    width: 36px;
    padding-block: var(--space-2);
    background-color: var(--background);
    border-inline-start: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 2;
  }

  .ContextRail__icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--muted-foreground);
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .ContextRail__icon-btn:hover {
    color: var(--foreground);
    background-color: var(--accent);
  }

  .ContextRail__icon-btn--active {
    color: var(--interactive);
    background-color: var(--accent);
  }

  .ContextRail__panel {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 36px;
    width: 280px;
    background-color: var(--background);
    border-inline-start: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    z-index: 2;
    overflow: hidden;
    padding-block-start: var(--space-2);
  }
</style>
