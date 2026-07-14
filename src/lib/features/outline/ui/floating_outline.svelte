<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import OutlinePanel from "./outline_panel.svelte";
  import OutlineShell from "./outline_shell.svelte";

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
    <OutlineShell
      {collapsed}
      toggle_title={collapsed ? "Expand outline" : "Collapse outline"}
      on_toggle={() =>
        void action_registry.execute(ACTION_IDS.ui_toggle_outline_panel)}
      close_title="Switch to sidebar"
      on_close={() => {
        const updated = {
          ...stores.ui.editor_settings,
          outline_mode: "rail" as const,
        };
        stores.ui.set_editor_settings(updated);
      }}
    >
      <OutlinePanel />
    </OutlineShell>
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
</style>
