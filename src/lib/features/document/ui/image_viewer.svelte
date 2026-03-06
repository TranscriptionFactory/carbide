<script lang="ts">
  import ZoomInIcon from "@lucide/svelte/icons/zoom-in";
  import ZoomOutIcon from "@lucide/svelte/icons/zoom-out";
  import MaximizeIcon from "@lucide/svelte/icons/maximize";
  import ScanIcon from "@lucide/svelte/icons/scan";

  interface Props {
    src: string;
  }

  let { src }: Props = $props();

  let zoom = $state(1);
  let pan_x = $state(0);
  let pan_y = $state(0);
  let fit_to_width = $state(false);
  let is_dragging = $state(false);
  let drag_start_x = 0;
  let drag_start_y = 0;
  let canvas_el: HTMLDivElement | undefined = $state();

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 10;
  const ZOOM_STEP = 0.1;
  const ZOOM_WHEEL_FACTOR = 0.001;

  const zoom_percent = $derived(Math.round(zoom * 100));

  function clamp_zoom(value: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }

  function zoom_in() {
    fit_to_width = false;
    zoom = clamp_zoom(zoom + ZOOM_STEP);
    pan_x = 0;
    pan_y = 0;
  }

  function zoom_out() {
    fit_to_width = false;
    zoom = clamp_zoom(zoom - ZOOM_STEP);
    pan_x = 0;
    pan_y = 0;
  }

  function actual_size() {
    fit_to_width = false;
    zoom = 1;
    pan_x = 0;
    pan_y = 0;
  }

  function toggle_fit_to_width() {
    fit_to_width = !fit_to_width;
    if (fit_to_width) {
      zoom = 1;
      pan_x = 0;
      pan_y = 0;
    }
  }

  function on_wheel(event: WheelEvent) {
    event.preventDefault();
    fit_to_width = false;

    const rect = canvas_el!.getBoundingClientRect();
    const cursor_x = event.clientX - rect.left - rect.width / 2;
    const cursor_y = event.clientY - rect.top - rect.height / 2;

    const old_zoom = zoom;
    const new_zoom = clamp_zoom(zoom - event.deltaY * ZOOM_WHEEL_FACTOR);
    const zoom_ratio = new_zoom / old_zoom;

    pan_x = cursor_x + (pan_x - cursor_x) * zoom_ratio;
    pan_y = cursor_y + (pan_y - cursor_y) * zoom_ratio;
    zoom = new_zoom;
  }

  function on_mousedown(event: MouseEvent) {
    if (event.button !== 0) return;
    is_dragging = true;
    drag_start_x = event.clientX - pan_x;
    drag_start_y = event.clientY - pan_y;
  }

  function on_mousemove(event: MouseEvent) {
    if (!is_dragging) return;
    pan_x = event.clientX - drag_start_x;
    pan_y = event.clientY - drag_start_y;
  }

  function on_mouseup() {
    is_dragging = false;
  }

  function on_mouseleave() {
    is_dragging = false;
  }
</script>

<div class="ImageViewer">
  <div
    class="ImageViewer__canvas"
    class:ImageViewer__canvas--fit={fit_to_width}
    class:ImageViewer__canvas--dragging={is_dragging}
    bind:this={canvas_el}
    role="img"
    aria-label="Image viewer"
    onwheel={on_wheel}
    onmousedown={on_mousedown}
    onmousemove={on_mousemove}
    onmouseup={on_mouseup}
    onmouseleave={on_mouseleave}
  >
    <img
      {src}
      alt=""
      class="ImageViewer__image"
      class:ImageViewer__image--fit={fit_to_width}
      style={fit_to_width
        ? ""
        : `transform: translate(${pan_x}px, ${pan_y}px) scale(${zoom});`}
      draggable="false"
    />
  </div>

  <div class="ImageViewer__toolbar">
    <button
      class="ImageViewer__toolbar-btn"
      onclick={zoom_out}
      aria-label="Zoom out"
      title="Zoom out"
    >
      <ZoomOutIcon class="ImageViewer__toolbar-icon" />
    </button>

    <span class="ImageViewer__zoom-label">{zoom_percent}%</span>

    <button
      class="ImageViewer__toolbar-btn"
      onclick={zoom_in}
      aria-label="Zoom in"
      title="Zoom in"
    >
      <ZoomInIcon class="ImageViewer__toolbar-icon" />
    </button>

    <div class="ImageViewer__toolbar-divider"></div>

    <button
      class="ImageViewer__toolbar-btn"
      class:ImageViewer__toolbar-btn--active={fit_to_width}
      onclick={toggle_fit_to_width}
      aria-label="Fit to width"
      aria-pressed={fit_to_width}
      title="Fit to width"
    >
      <MaximizeIcon class="ImageViewer__toolbar-icon" />
    </button>

    <button
      class="ImageViewer__toolbar-btn"
      onclick={actual_size}
      aria-label="Actual size"
      title="Actual size (100%)"
    >
      <ScanIcon class="ImageViewer__toolbar-icon" />
    </button>
  </div>
</div>

<style>
  .ImageViewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    overflow: hidden;
  }

  .ImageViewer__canvas {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    background-image:
      linear-gradient(45deg, var(--muted) 25%, transparent 25%),
      linear-gradient(-45deg, var(--muted) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--muted) 75%),
      linear-gradient(-45deg, transparent 75%, var(--muted) 75%);
    background-size: 20px 20px;
    background-position:
      0 0,
      0 10px,
      10px -10px,
      -10px 0px;
    background-color: var(--background);
  }

  .ImageViewer__canvas--dragging {
    cursor: grabbing;
  }

  .ImageViewer__canvas--fit {
    cursor: default;
  }

  .ImageViewer__image {
    max-width: none;
    max-height: none;
    transform-origin: center center;
    transition:
      transform var(--duration-fast) var(--ease-out),
      width var(--duration-fast) var(--ease-out);
    user-select: none;
    pointer-events: none;
  }

  .ImageViewer__image--fit {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transform: none;
  }

  .ImageViewer__toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1-5) var(--space-3);
    border-top: 1px solid var(--border);
    background-color: var(--background);
    flex-shrink: 0;
  }

  .ImageViewer__toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border-radius: var(--radius-md);
    color: var(--muted-foreground);
    background: none;
    border: none;
    cursor: pointer;
    transition: color var(--duration-fast) var(--ease-default);
  }

  .ImageViewer__toolbar-btn:hover {
    color: var(--foreground);
    background-color: var(--muted);
  }

  .ImageViewer__toolbar-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .ImageViewer__toolbar-btn--active {
    color: var(--interactive);
    background-color: var(--interactive-bg);
  }

  .ImageViewer__toolbar-btn--active:hover {
    background-color: var(--interactive-bg-hover);
  }

  :global(.ImageViewer__toolbar-icon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }

  .ImageViewer__zoom-label {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
    min-width: 3.5ch;
    text-align: center;
  }

  .ImageViewer__toolbar-divider {
    width: 1px;
    height: var(--size-icon);
    background-color: var(--border);
    margin-inline: var(--space-1);
  }
</style>
