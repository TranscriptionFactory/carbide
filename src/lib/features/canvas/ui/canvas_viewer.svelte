<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import type { CanvasTabState } from "$lib/features/canvas/state/canvas_store.svelte";

  interface Props {
    tab_id: string;
    file_path: string;
    file_type: "canvas" | "excalidraw";
  }

  let { tab_id, file_path, file_type }: Props = $props();
  const { stores } = use_app_context();

  const canvas_state: CanvasTabState | undefined = $derived(
    stores.canvas.get_state(tab_id),
  );

  const node_count = $derived(canvas_state?.canvas_data?.nodes.length ?? 0);
  const edge_count = $derived(canvas_state?.canvas_data?.edges.length ?? 0);
</script>

<div class="CanvasViewer">
  {#if canvas_state?.status === "loading"}
    <div class="CanvasViewer__state">
      <span>Loading canvas…</span>
    </div>
  {:else if canvas_state?.status === "error"}
    <div class="CanvasViewer__state CanvasViewer__state--error">
      <span>{canvas_state.error_message ?? "Failed to load canvas"}</span>
    </div>
  {:else if canvas_state?.status === "ready"}
    <div class="CanvasViewer__placeholder">
      <span class="CanvasViewer__file-type"
        >{file_type === "excalidraw"
          ? "Excalidraw Drawing"
          : "JSON Canvas"}</span
      >
      <span class="CanvasViewer__file-path">{file_path}</span>
      {#if file_type === "canvas"}
        <span class="CanvasViewer__stats"
          >{node_count} nodes · {edge_count} edges</span
        >
      {/if}
    </div>
  {:else}
    <div class="CanvasViewer__state">
      <span>No canvas loaded</span>
    </div>
  {/if}
</div>

<style>
  .CanvasViewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .CanvasViewer__state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .CanvasViewer__state--error {
    color: var(--destructive);
  }

  .CanvasViewer__placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 0.5rem;
  }

  .CanvasViewer__file-type {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--foreground);
  }

  .CanvasViewer__file-path {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .CanvasViewer__stats {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }
</style>
