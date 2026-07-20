<script lang="ts">
  import { Settings, CircleHelp } from "@lucide/svelte";
  import type { SidebarView, SidebarViewMeta } from "$lib/app";

  type Props = {
    sidebar_open: boolean;
    active_view: SidebarView;
    configured_views: SidebarViewMeta[];
    on_open_view: (id: string) => void;
    on_open_help: () => void;
    on_open_settings: () => void;
  };

  let {
    sidebar_open,
    active_view,
    configured_views,
    on_open_view,
    on_open_help,
    on_open_settings,
  }: Props = $props();
</script>

<!-- drag region only fires when the bar background itself is the event
     target, so the buttons inside stay fully clickable -->
<div class="ActivityBar" data-testid="activity-bar" data-tauri-drag-region>
  <div class="ActivityBar__section">
    {#each configured_views as view (view.id)}
      <button
        type="button"
        class="ActivityBar__button"
        class:ActivityBar__button--active={sidebar_open &&
          active_view === view.id}
        data-testid="activity-bar-button"
        data-view-id={view.id}
        onclick={() => on_open_view(view.id)}
        aria-pressed={sidebar_open && active_view === view.id}
        aria-label={view.label}
      >
        <view.icon class="ActivityBar__icon" />
      </button>
    {/each}
  </div>

  <div class="ActivityBar__section">
    <button
      type="button"
      class="ActivityBar__button"
      data-testid="activity-bar-help"
      onclick={on_open_help}
      aria-label="Help"
    >
      <CircleHelp class="ActivityBar__icon" />
    </button>
    <button
      type="button"
      class="ActivityBar__button"
      data-testid="activity-bar-settings"
      onclick={on_open_settings}
      aria-label="Settings"
    >
      <Settings class="ActivityBar__icon" />
    </button>
  </div>
</div>

<style>
  .ActivityBar {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    width: var(--size-activity-bar);
    height: 100%;
    padding-block: var(--space-2);
    background-color: var(--activity-bar-bg);
    box-shadow: inset -1px 0 0 var(--sidebar-border);
  }

  .ActivityBar__section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  .ActivityBar__button {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border-radius: var(--radius-md);
    color: var(--muted-foreground);
    transition:
      background-color var(--duration-normal) var(--ease-default),
      color var(--duration-normal) var(--ease-default);
  }

  .ActivityBar__button:hover {
    background-color: color-mix(
      in oklch,
      var(--activity-bar-fg) 8%,
      transparent
    );
    color: var(--activity-bar-fg);
  }

  .ActivityBar__button:focus-visible {
    color: var(--activity-bar-fg);
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .ActivityBar__button--active {
    color: var(--activity-bar-fg);
  }

  .ActivityBar__button--active::before {
    content: "";
    position: absolute;
    inset-block: var(--space-2);
    inset-inline-start: 0;
    width: 2px;
    background-color: var(--sidebar-active-bar);
    border-radius: 1px;
  }

  :global(.ActivityBar__icon) {
    width: var(--size-activity-icon);
    height: var(--size-activity-icon);
  }

  /* ----- Sidebar active-shape contract (activity bar) ----- */
  :global([data-sidebar-active="fill"]) .ActivityBar__button--active::before {
    display: none;
  }
  :global([data-sidebar-active="fill"]) .ActivityBar__button--active {
    background-color: var(--sidebar-accent);
    color: var(--interactive);
  }

  :global([data-sidebar-active="weight"]) .ActivityBar__button--active::before {
    background-color: var(--foreground);
  }

  :global([data-sidebar-active="invert"]) .ActivityBar__button--active::before {
    display: none;
  }
  :global([data-sidebar-active="invert"]) .ActivityBar__button--active {
    background-color: var(--interactive);
    color: var(--background);
  }

  /* ----- Activity-bar mode contract (layout presets) ----- */
  /* floating-dock (spotlight): horizontal glass pill, bottom-left */
  :global([data-activitybar-mode="floating-dock"]) .ActivityBar {
    position: absolute;
    bottom: var(--space-3);
    left: var(--space-3);
    height: auto;
    width: auto;
    flex-direction: row;
    align-items: center;
    padding: var(--space-1) var(--space-2);
    gap: var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background-color: var(--chrome-glass);
    box-shadow: var(--shadow-2);
    z-index: 100;
    opacity: var(--chrome-idle-opacity, 1);
    transition: opacity var(--duration-normal) var(--ease-default);
  }

  :global([data-activitybar-mode="floating-dock"]) .ActivityBar:hover,
  :global([data-activitybar-mode="floating-dock"]) .ActivityBar:focus-within {
    opacity: 1;
  }

  :global([data-activitybar-mode="floating-dock"]) .ActivityBar__section {
    flex-direction: row;
    align-items: center;
    gap: var(--space-1);
  }

  :global([data-activitybar-mode="floating-dock"])
    .ActivityBar__section:first-child {
    padding-inline-end: var(--space-2);
    border-inline-end: 1px solid var(--border);
    margin-inline-end: var(--space-2);
  }

  :global([data-activitybar-mode="floating-dock"]) .ActivityBar__button {
    border-radius: var(--radius-full);
  }

  :global([data-activitybar-mode="floating-dock"])
    .ActivityBar__button--active::before {
    inset-inline-start: var(--space-1);
    inset-inline-end: var(--space-1);
    inset-block-start: auto;
    inset-block-end: var(--space-0-5);
    width: auto;
    height: 2px;
  }

  /* edge-reveal (theater): accent edge strip that expands on hover */
  :global([data-chrome-mode="edge-reveal"]) .ActivityBar {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    /* The CustomTitleBar window-resize handle (6px, z 1001) covers the strip's
       whole 3px, eating :hover. A transparent border widens the hit box past
       the handle while background-clip keeps the painted strip at 3px;
       overflow:hidden clips pseudo-elements, so a ::after hit zone would not
       work here. border-box sizing makes the border additive via calc. */
    width: calc(var(--chrome-edge-width, 3px) + 9px);
    padding: 0;
    overflow: hidden;
    background-color: var(--interactive);
    border: none;
    border-right: 9px solid transparent;
    background-clip: padding-box;
    border-radius: 0;
    opacity: 0.4;
    z-index: 200;
    transition:
      width var(--chrome-reveal-speed) var(--chrome-reveal-ease),
      opacity var(--chrome-reveal-speed) var(--chrome-reveal-ease),
      background-color var(--chrome-reveal-speed) var(--chrome-reveal-ease),
      padding var(--chrome-reveal-speed) var(--chrome-reveal-ease),
      border-radius var(--chrome-reveal-speed) var(--chrome-reveal-ease),
      box-shadow var(--chrome-reveal-speed) var(--chrome-reveal-ease);
  }

  :global([data-chrome-mode="edge-reveal"]) .ActivityBar:hover,
  :global([data-chrome-mode="edge-reveal"]) .ActivityBar:focus-within {
    width: var(--size-activity-bar);
    padding-block: var(--space-2);
    border-right: none;
    opacity: 1;
    background-color: color-mix(in oklch, var(--card) 95%, transparent);
    backdrop-filter: blur(20px);
    border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
    box-shadow: var(--shadow-3);
  }

  :global([data-chrome-mode="edge-reveal"]) .ActivityBar__section {
    flex-direction: column;
    align-items: center;
    gap: var(--space-0-5);
  }

  :global([data-chrome-mode="edge-reveal"]) .ActivityBar__section:first-child {
    padding-block-end: var(--space-1);
    border-block-end: 1px solid var(--border);
    margin-block-end: var(--space-1);
  }

  :global([data-chrome-mode="edge-reveal"]) .ActivityBar__button {
    border-radius: var(--radius-sm);
  }

  /* Absolute positioning resolves against the WorkspaceLayout border box, so
     the macOS drag-strip padding does not push the rail down; offset it
     explicitly or its top edge sits under the traffic lights. */
  :global([data-chrome-mode="edge-reveal"] body.macos-drag-strip) .ActivityBar {
    top: var(--macos-drag-strip-height);
  }
</style>
