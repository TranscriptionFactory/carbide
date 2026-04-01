<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import OutlinePanel from "./outline_panel.svelte";
  import XIcon from "@lucide/svelte/icons/x";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";

  const { stores, action_registry } = use_app_context();

  const is_floating = $derived(
    stores.ui.editor_settings.outline_mode === "floating" &&
      stores.outline.headings.length > 0 &&
      !stores.ui.zen_mode,
  );

  const collapsed = $derived(stores.ui.floating_outline_collapsed);
</script>

{#if is_floating}
  <div class="FloatingOutline" class:FloatingOutline--collapsed={collapsed}>
    <div class="FloatingOutline__header">
      <button
        type="button"
        class="FloatingOutline__toggle"
        onclick={() =>
          void action_registry.execute(ACTION_IDS.ui_toggle_outline_panel)}
        title={collapsed ? "Expand outline" : "Collapse outline"}
      >
        <ChevronsUpDown />
      </button>
      <span class="FloatingOutline__title">Outline</span>
      <button
        type="button"
        class="FloatingOutline__close"
        onclick={() => {
          const updated = {
            ...stores.ui.editor_settings,
            outline_mode: "rail" as const,
          };
          stores.ui.set_editor_settings(updated);
        }}
        title="Switch to sidebar"
      >
        <XIcon />
      </button>
    </div>
    {#if !collapsed}
      <div class="FloatingOutline__body">
        <OutlinePanel />
      </div>
    {/if}
  </div>
{/if}

<style>
  .FloatingOutline {
    position: absolute;
    top: var(--space-10);
    right: var(--space-3);
    z-index: 10;
    display: flex;
    flex-direction: column;
    width: 240px;
    max-height: 60vh;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background-color: var(--popover);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  .FloatingOutline__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-block-end: 1px solid var(--border);
    flex-shrink: 0;
  }

  .FloatingOutline__title {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
  }

  .FloatingOutline__close,
  .FloatingOutline__toggle {
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

  .FloatingOutline__close:hover,
  .FloatingOutline__toggle:hover {
    color: var(--foreground);
    background-color: var(--accent);
  }

  :global(.FloatingOutline__close svg),
  :global(.FloatingOutline__toggle svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .FloatingOutline__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
