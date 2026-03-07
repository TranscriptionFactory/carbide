<script lang="ts">
  interface Props {
    src: string;
  }

  let { src }: Props = $props();

  let zoom = $state(1.0);
  let error = $state(false);

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 8.0;
  const ZOOM_STEP = 0.25;

  function zoom_in() {
    zoom = Math.min(MAX_ZOOM, zoom + ZOOM_STEP);
  }

  function zoom_out() {
    zoom = Math.max(MIN_ZOOM, zoom - ZOOM_STEP);
  }

  function reset_zoom() {
    zoom = 1.0;
  }

  function on_error() {
    error = true;
  }

  $effect(() => {
    error = false;
  });
</script>

<div class="ImageViewer">
  <div class="ImageViewer__toolbar">
    <button class="ImageViewer__btn" onclick={zoom_out} aria-label="Zoom out"
      >−</button
    >
    <button
      class="ImageViewer__btn ImageViewer__btn--zoom"
      onclick={reset_zoom}
    >
      {Math.round(zoom * 100)}%
    </button>
    <button class="ImageViewer__btn" onclick={zoom_in} aria-label="Zoom in"
      >+</button
    >
  </div>

  <div class="ImageViewer__canvas">
    {#if error}
      <span class="ImageViewer__error">Failed to load image</span>
    {:else}
      <img
        class="ImageViewer__img"
        {src}
        alt=""
        style:transform="scale({zoom})"
        style:transform-origin="top center"
        onerror={on_error}
      />
    {/if}
  </div>
</div>

<style>
  .ImageViewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    color: var(--foreground);
  }

  .ImageViewer__toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    background-color: var(--muted);
    flex-shrink: 0;
  }

  .ImageViewer__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--space-7);
    height: var(--space-7);
    padding: 0 var(--space-2);
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
    color: var(--foreground);
    cursor: pointer;
    font-size: var(--text-sm);
    transition: background-color 0.15s ease;
  }

  .ImageViewer__btn:hover {
    background-color: var(--accent);
  }

  .ImageViewer__btn--zoom {
    min-width: calc(var(--space-6) + var(--space-3));
    text-align: center;
    color: var(--muted-foreground);
  }

  .ImageViewer__canvas {
    flex: 1;
    overflow: auto;
    display: flex;
    justify-content: center;
    padding: var(--space-4);
  }

  .ImageViewer__img {
    display: block;
    max-width: 100%;
    height: auto;
    object-fit: contain;
  }

  .ImageViewer__error {
    font-size: var(--text-sm);
    color: var(--destructive);
  }
</style>
