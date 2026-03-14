<script lang="ts">
  import type { Camera, CanvasData } from "$lib/features/canvas/types/canvas";
  import {
    zoom_at_point,
    clamp_zoom,
  } from "$lib/features/canvas/domain/canvas_viewport";
  import CanvasNodeComponent from "$lib/features/canvas/ui/canvas_node.svelte";
  import CanvasEdges from "$lib/features/canvas/ui/canvas_edges.svelte";

  interface Props {
    canvas_data: CanvasData;
    camera: Camera;
    on_camera_change: (camera: Camera) => void;
  }

  let { canvas_data, camera, on_camera_change }: Props = $props();

  let container: HTMLDivElement | null = $state(null);
  let is_panning = $state(false);
  let pan_start = $state({ x: 0, y: 0 });
  let camera_start = $state({ x: 0, y: 0 });

  const transform = $derived(
    `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`,
  );

  function handle_wheel(event: WheelEvent) {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const rect = container!.getBoundingClientRect();
      const screen_x = event.clientX - rect.left;
      const screen_y = event.clientY - rect.top;
      const delta = -event.deltaY * 0.005;
      const new_zoom = camera.zoom * (1 + delta);
      on_camera_change(zoom_at_point(camera, screen_x, screen_y, new_zoom));
    } else {
      on_camera_change({
        x: camera.x + event.deltaX / camera.zoom,
        y: camera.y + event.deltaY / camera.zoom,
        zoom: camera.zoom,
      });
    }
  }

  function handle_pointerdown(event: PointerEvent) {
    if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
      event.preventDefault();
      is_panning = true;
      pan_start = { x: event.clientX, y: event.clientY };
      camera_start = { x: camera.x, y: camera.y };
      container?.setPointerCapture(event.pointerId);
    }
  }

  function handle_pointermove(event: PointerEvent) {
    if (!is_panning) return;
    const dx = (event.clientX - pan_start.x) / camera.zoom;
    const dy = (event.clientY - pan_start.y) / camera.zoom;
    on_camera_change({
      x: camera_start.x - dx,
      y: camera_start.y - dy,
      zoom: camera.zoom,
    });
  }

  function handle_pointerup(event: PointerEvent) {
    if (is_panning) {
      is_panning = false;
      container?.releasePointerCapture(event.pointerId);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="CanvasSurface"
  class:CanvasSurface--panning={is_panning}
  bind:this={container}
  onwheel={handle_wheel}
  onpointerdown={handle_pointerdown}
  onpointermove={handle_pointermove}
  onpointerup={handle_pointerup}
  role="application"
  aria-label="Canvas"
  tabindex="0"
>
  <div class="CanvasSurface__world" style:transform>
    <CanvasEdges edges={canvas_data.edges} nodes={canvas_data.nodes} />
    {#each canvas_data.nodes as node (node.id)}
      <CanvasNodeComponent {node} />
    {/each}
  </div>

  <div class="CanvasSurface__zoom-indicator">
    {Math.round(camera.zoom * 100)}%
  </div>
</div>

<style>
  .CanvasSurface {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: grab;
    background-color: var(--background);
    background-image: radial-gradient(
      circle,
      var(--border) 0.5px,
      transparent 0.5px
    );
    background-size: 20px 20px;
  }

  .CanvasSurface--panning {
    cursor: grabbing;
  }

  .CanvasSurface__world {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    pointer-events: none;
  }

  .CanvasSurface__zoom-indicator {
    position: absolute;
    bottom: 12px;
    right: 12px;
    padding: 2px 8px;
    font-size: 11px;
    color: var(--muted-foreground);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 4px;
    pointer-events: none;
    user-select: none;
  }
</style>
