<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import { FilePlus } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";

  const { stores, action_registry } = use_app_context();

  const canvas_files = $derived(
    stores.notes.notes
      .filter(
        (n) => n.path.endsWith(".excalidraw") || n.path.endsWith(".canvas"),
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  function open_canvas(path: string) {
    void action_registry.execute(ACTION_IDS.canvas_open, path);
  }

  function create_canvas() {
    void action_registry.execute(ACTION_IDS.canvas_create);
  }
</script>

<div class="CanvasPanel">
  <div class="CanvasPanel__header">
    <Button
      variant="ghost"
      size="icon"
      onclick={create_canvas}
      title="New Canvas"
    >
      <FilePlus class="h-4 w-4" />
    </Button>
  </div>

  {#if canvas_files.length === 0}
    <div class="CanvasPanel__empty">
      <p>No canvases yet</p>
      <Button variant="outline" size="sm" onclick={create_canvas}>
        New Canvas
      </Button>
    </div>
  {:else}
    <div class="CanvasPanel__list">
      {#each canvas_files as file (file.path)}
        <button
          class="CanvasPanel__item"
          onclick={() => open_canvas(file.path)}
          title={file.path}
        >
          <span class="CanvasPanel__name">{file.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .CanvasPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .CanvasPanel__header {
    display: flex;
    justify-content: flex-end;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }

  .CanvasPanel__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex: 1;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }

  .CanvasPanel__list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .CanvasPanel__item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 6px 12px;
    gap: 8px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--foreground);
    text-align: left;
  }

  .CanvasPanel__item:hover {
    background: var(--accent);
  }

  .CanvasPanel__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
