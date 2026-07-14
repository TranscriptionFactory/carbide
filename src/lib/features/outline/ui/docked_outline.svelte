<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import OutlinePanel from "./outline_panel.svelte";
  import OutlineShell from "./outline_shell.svelte";

  const { stores } = use_app_context();
</script>

<div class="DockedOutline">
  <OutlineShell
    close_title="Hide outline"
    on_close={() => (stores.ui.outline_docked_open = false)}
    nav_region="outline"
  >
    <OutlinePanel />
  </OutlineShell>
</div>

<style>
  .DockedOutline {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    border-inline-start: 1px solid var(--border);
  }
</style>
