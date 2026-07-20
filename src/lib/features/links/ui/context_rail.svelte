<script lang="ts">
  import { Link, List, Tags, Compass } from "@lucide/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  const { stores } = use_app_context();

  const all_tabs = [
    { id: "links" as const, label: "Links", icon: Link },
    { id: "outline" as const, label: "Outline", icon: List },
    { id: "metadata" as const, label: "Meta", icon: Tags },
    { id: "related" as const, label: "Related", icon: Compass },
  ];

  const outline_docked = $derived(
    stores.ui.editor_settings.outline_mode === "docked",
  );
  /* In docked mode the outline icon toggles the docked pane rather than a rail
     panel, so keep it unless the note has no headings (the pane is gated on
     headings too, so a toggle would be a no-op). */
  const tabs = $derived(
    outline_docked && stores.outline.headings.length === 0
      ? all_tabs.filter((t) => t.id !== "outline")
      : all_tabs,
  );

  function is_tab_active(id: (typeof tabs)[number]["id"]): boolean {
    if (id === "outline" && outline_docked)
      return stores.ui.outline_docked_open;
    return stores.ui.context_rail_open && stores.ui.context_rail_tab === id;
  }

  function on_icon_click(id: (typeof tabs)[number]["id"]) {
    if (id === "outline" && outline_docked) {
      stores.ui.outline_docked_open = !stores.ui.outline_docked_open;
      return;
    }
    if (stores.ui.context_rail_open && stores.ui.context_rail_tab === id) {
      stores.ui.context_rail_open = false;
    } else {
      stores.ui.set_context_rail_tab(id);
    }
  }
</script>

<div class="ContextRail__icons" data-testid="context-rail">
  {#each tabs as tab (tab.id)}
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            class="ContextRail__icon-btn"
            class:ContextRail__icon-btn--active={is_tab_active(tab.id)}
            onclick={() => on_icon_click(tab.id)}
            aria-pressed={is_tab_active(tab.id)}
            aria-label={tab.label}
            data-testid={"context-rail-tab-" + tab.id}
          >
            <tab.icon size={16} />
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="left">{tab.label}</Tooltip.Content>
    </Tooltip.Root>
  {/each}
</div>

<style>
  .ContextRail__icons {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    width: 36px;
    height: 100%;
    padding-block: var(--space-2);
    background-color: var(--background);
    box-shadow: inset 1px 0 0 var(--border);
    flex-shrink: 0;
    z-index: 2;
  }

  .ContextRail__icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border: none;
    background: none;
    border-radius: var(--radius-md);
    color: var(--muted-foreground);
    transition:
      color var(--duration-normal) var(--ease-default),
      background-color var(--duration-normal) var(--ease-default);
  }

  .ContextRail__icon-btn:hover {
    color: var(--foreground);
    background-color: var(--accent);
  }

  .ContextRail__icon-btn--active {
    color: var(--interactive);
    background-color: var(--interactive-bg);
  }
</style>
