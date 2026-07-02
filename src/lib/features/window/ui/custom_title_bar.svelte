<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { should_use_custom_window_chrome } from "$lib/features/window/domain/platform";

  const TITLEBAR_HEIGHT = 32;
  const RESIZE_EDGE = 6;

  let maximized = $state(false);

  type ResizeDirection =
    | "East"
    | "North"
    | "NorthEast"
    | "NorthWest"
    | "South"
    | "SouthEast"
    | "SouthWest"
    | "West";

  const RESIZE_HANDLES: ReadonlyArray<{
    direction: ResizeDirection;
    cursor: string;
    style: string;
  }> = [
    { direction: "North", cursor: "ns-resize", style: `top:0;left:${RESIZE_EDGE}px;right:${RESIZE_EDGE}px;height:${RESIZE_EDGE}px` },
    { direction: "South", cursor: "ns-resize", style: `bottom:0;left:${RESIZE_EDGE}px;right:${RESIZE_EDGE}px;height:${RESIZE_EDGE}px` },
    { direction: "East", cursor: "ew-resize", style: `top:${RESIZE_EDGE}px;right:0;bottom:${RESIZE_EDGE}px;width:${RESIZE_EDGE}px` },
    { direction: "West", cursor: "ew-resize", style: `top:${RESIZE_EDGE}px;left:0;bottom:${RESIZE_EDGE}px;width:${RESIZE_EDGE}px` },
    { direction: "NorthEast", cursor: "nesw-resize", style: `top:0;right:0;width:${RESIZE_EDGE}px;height:${RESIZE_EDGE}px` },
    { direction: "NorthWest", cursor: "nwse-resize", style: `top:0;left:0;width:${RESIZE_EDGE}px;height:${RESIZE_EDGE}px` },
    { direction: "SouthEast", cursor: "nwse-resize", style: `bottom:0;right:0;width:${RESIZE_EDGE}px;height:${RESIZE_EDGE}px` },
    { direction: "SouthWest", cursor: "nesw-resize", style: `bottom:0;left:0;width:${RESIZE_EDGE}px;height:${RESIZE_EDGE}px` },
  ];

  function on_start_resize(direction: ResizeDirection) {
    return (event: MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      void getCurrentWindow().startResizeDragging(direction).catch(() => {});
    };
  }

  function on_minimize() {
    void getCurrentWindow().minimize().catch(() => {});
  }

  function on_toggle_maximize() {
    void getCurrentWindow().toggleMaximize().catch(() => {});
  }

  function on_close() {
    void getCurrentWindow().close().catch(() => {});
  }

  onMount(() => {
    void getCurrentWindow()
      .isMaximized()
      .then((v) => { maximized = v; })
      .catch(() => {});

    const unlisten_promise = getCurrentWindow().onResized(() => {
      void getCurrentWindow()
        .isMaximized()
        .then((v) => { maximized = v; })
        .catch(() => {});
    });

    return () => {
      unlisten_promise.then((unlisten) => unlisten()).catch(() => {});
    };
  });
</script>

{#if should_use_custom_window_chrome()}
  {#each RESIZE_HANDLES as handle (handle.direction)}
    <div
      aria-hidden="true"
      class="CustomTitleBar__resize-handle"
      style="position:fixed;z-index:1001;{handle.style};cursor:{handle.cursor}"
      data-no-drag
      onmousedown={on_start_resize(handle.direction)}
    ></div>
  {/each}

  <div
    class="CustomTitleBar"
    style="height:{TITLEBAR_HEIGHT}px"
    data-tauri-drag-region
  >
    <div class="CustomTitleBar__controls" data-no-drag>
      <button
        type="button"
        class="CustomTitleBar__btn"
        aria-label="Minimize"
        onclick={on_minimize}
        data-no-drag
      >
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
          <line x1="2.5" y1="6" x2="9.5" y2="6" />
        </svg>
      </button>
      <button
        type="button"
        class="CustomTitleBar__btn"
        aria-label={maximized ? "Restore" : "Maximize"}
        onclick={on_toggle_maximize}
        data-no-drag
      >
        {#if maximized}
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1.5" y="3.5" width="7" height="7" rx="0.5" />
            <path d="M3.5 3.5V2.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H9.5" />
          </svg>
        {:else}
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2.5" y="2.5" width="7" height="7" rx="0.5" />
          </svg>
        {/if}
      </button>
      <button
        type="button"
        class="CustomTitleBar__btn CustomTitleBar__btn--close"
        aria-label="Close"
        onclick={on_close}
        data-no-drag
      >
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
          <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
          <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .CustomTitleBar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    background-color: var(--background-surface-2, var(--sidebar));
    border-bottom: 1px solid var(--border);
    -webkit-app-region: drag;
    user-select: none;
  }

  .CustomTitleBar__controls {
    display: flex;
    height: 100%;
    -webkit-app-region: no-drag;
  }

  .CustomTitleBar__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 100%;
    border-radius: 0;
    color: var(--muted-foreground);
    transition: background-color var(--duration-fast, 150ms) var(--ease-default, ease),
      color var(--duration-fast, 150ms) var(--ease-default, ease);
  }

  .CustomTitleBar__btn:hover {
    background-color: color-mix(in oklch, var(--foreground) 10%, transparent);
    color: var(--foreground);
  }

  .CustomTitleBar__btn--close:hover {
    background-color: var(--destructive);
    color: var(--destructive-foreground, #fff);
  }

  .CustomTitleBar__resize-handle {
    position: fixed;
    z-index: 1001;
  }
</style>
