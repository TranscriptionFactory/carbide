<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import type { CanvasTabState } from "$lib/features/canvas/state/canvas_store.svelte";
  import type { Camera } from "$lib/features/canvas/types/canvas";
  import CanvasSurface from "$lib/features/canvas/ui/canvas_surface.svelte";
  import ExcalidrawHost from "$lib/features/canvas/ui/excalidraw_host.svelte";

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

  let excalidraw_host: ExcalidrawHost | undefined = $state();

  let is_dark = $state(document.documentElement.classList.contains("dark"));

  $effect(() => {
    const observer = new MutationObserver(() => {
      is_dark = document.documentElement.classList.contains("dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  });

  $effect(() => {
    if (file_type !== "excalidraw") return;
    stores.canvas.register_scene_provider(tab_id, async () => {
      return excalidraw_host
        ? await excalidraw_host.get_scene()
        : (canvas_state?.excalidraw_scene ?? {
            type: "excalidraw",
            version: 2,
            source: "badgerly",
            elements: [],
            appState: {},
          });
    });
    return () => stores.canvas.unregister_scene_provider(tab_id);
  });

  const app_theme = $derived(is_dark ? ("dark" as const) : ("light" as const));

  function handle_camera_change(camera: Camera) {
    stores.canvas.set_camera(tab_id, camera);
  }

  function handle_excalidraw_change(
    _elements: unknown[],
    _appState: Record<string, unknown>,
    dirty: boolean,
  ) {
    if (dirty) {
      stores.canvas.set_dirty(tab_id, true);
    }
  }
</script>

<div class="CanvasViewer">
  {#if canvas_state?.status === "loading"}
    <div class="CanvasViewer__state">
      <span>Loading…</span>
    </div>
  {:else if canvas_state?.status === "error"}
    <div class="CanvasViewer__state CanvasViewer__state--error">
      <span>{canvas_state.error_message ?? "Failed to load"}</span>
    </div>
  {:else if canvas_state?.status === "ready"}
    {#if file_type === "excalidraw" && canvas_state.excalidraw_scene}
      <ExcalidrawHost
        bind:this={excalidraw_host}
        scene={canvas_state.excalidraw_scene}
        theme={app_theme}
        on_change={handle_excalidraw_change}
      />
    {:else if canvas_state.canvas_data}
      <CanvasSurface
        canvas_data={canvas_state.canvas_data}
        camera={canvas_state.camera}
        on_camera_change={handle_camera_change}
      />
    {/if}
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
</style>
