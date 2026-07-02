<script lang="ts">
  import { onMount } from "svelte";
  import { DocumentViewer } from "$lib/features/document";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import { make_close_window_handler } from "$lib/hooks/use_close_window.svelte";

  const { stores, action_registry } = use_app_context();

  const active_tab = $derived(stores.tab.active_tab);
  const viewer_state = $derived(
    active_tab?.kind === "document"
      ? stores.document.get_viewer_state(active_tab.id)
      : undefined,
  );
  const content_state = $derived(
    active_tab?.kind === "document"
      ? stores.document.get_content_state(active_tab.id)
      : undefined,
  );

  const handle_keydown = make_close_window_handler();

  onMount(() => {
    void action_registry.execute(ACTION_IDS.app_mounted);
  });
</script>

<svelte:window onkeydown={handle_keydown} />

<div class="ViewerShell">
  {#if viewer_state}
    <DocumentViewer {viewer_state} {content_state} />
  {:else}
    <div class="ViewerShell__empty">
      <p>Loading document…</p>
    </div>
  {/if}
</div>

<style>
  .ViewerShell {
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    box-shadow:
      0 8px 18px rgba(15, 23, 42, 0.12),
      0 1px 3px rgba(15, 23, 42, 0.1);
  }

  :global([data-color-scheme="dark"]) .ViewerShell {
    box-shadow:
      0 12px 26px rgba(0, 0, 0, 0.3),
      0 1px 4px rgba(0, 0, 0, 0.22);
  }

  .ViewerShell__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted-foreground);
  }
</style>
