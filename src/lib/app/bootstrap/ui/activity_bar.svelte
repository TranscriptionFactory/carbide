<script lang="ts">
  import {
    Files,
    LayoutDashboard,
    Settings,
    Star,
    CircleHelp,
    Network,
    ListChecks,
    Tags,
    GitBranch,
    CalendarDays,
  } from "@lucide/svelte";
  import type { SidebarView as DynamicSidebarView } from "$lib/features/plugin";
  import { SIDEBAR_VIEWS } from "$lib/app";
  import type { SidebarView } from "$lib/app";

  type Props = {
    sidebar_open: boolean;
    active_view: SidebarView;
    is_vault_mode: boolean;
    dynamic_views?: DynamicSidebarView[];
    on_open_view: (id: string) => void;
    on_open_help: () => void;
    on_open_settings: () => void;
  };

  let {
    sidebar_open,
    active_view,
    is_vault_mode,
    dynamic_views = [],
    on_open_view,
    on_open_help,
    on_open_settings,
  }: Props = $props();
</script>

<div class="ActivityBar">
  <div class="ActivityBar__section">
    <button
      type="button"
      class="ActivityBar__button"
      class:ActivityBar__button--active={sidebar_open &&
        active_view === SIDEBAR_VIEWS.explorer}
      onclick={() => on_open_view(SIDEBAR_VIEWS.explorer)}
      aria-pressed={sidebar_open && active_view === SIDEBAR_VIEWS.explorer}
      aria-label="Explorer"
    >
      <Files class="ActivityBar__icon" />
    </button>

    {#if is_vault_mode}
      <button
        type="button"
        class="ActivityBar__button"
        class:ActivityBar__button--active={sidebar_open &&
          active_view === SIDEBAR_VIEWS.starred}
        onclick={() => on_open_view(SIDEBAR_VIEWS.starred)}
        aria-pressed={sidebar_open && active_view === SIDEBAR_VIEWS.starred}
        aria-label="Starred"
      >
        <Star class="ActivityBar__icon" />
      </button>

      <button
        type="button"
        class="ActivityBar__button"
        class:ActivityBar__button--active={sidebar_open &&
          active_view === SIDEBAR_VIEWS.dashboard}
        onclick={() => on_open_view(SIDEBAR_VIEWS.dashboard)}
        aria-pressed={sidebar_open && active_view === SIDEBAR_VIEWS.dashboard}
        aria-label="Dashboard"
      >
        <LayoutDashboard class="ActivityBar__icon" />
      </button>

      <button
        type="button"
        class="ActivityBar__button"
        class:ActivityBar__button--active={sidebar_open &&
          active_view === SIDEBAR_VIEWS.tasks}
        onclick={() => on_open_view(SIDEBAR_VIEWS.tasks)}
        aria-pressed={sidebar_open && active_view === SIDEBAR_VIEWS.tasks}
        aria-label="Tasks"
      >
        <ListChecks class="ActivityBar__icon" />
      </button>

      <button
        type="button"
        class="ActivityBar__button"
        class:ActivityBar__button--active={sidebar_open &&
          active_view === SIDEBAR_VIEWS.daily_notes}
        onclick={() => on_open_view(SIDEBAR_VIEWS.daily_notes)}
        aria-pressed={sidebar_open && active_view === SIDEBAR_VIEWS.daily_notes}
        aria-label="Daily Notes"
      >
        <CalendarDays class="ActivityBar__icon" />
      </button>

      <button
        type="button"
        class="ActivityBar__button"
        class:ActivityBar__button--active={sidebar_open &&
          active_view === SIDEBAR_VIEWS.tags}
        onclick={() => on_open_view(SIDEBAR_VIEWS.tags)}
        aria-pressed={sidebar_open && active_view === SIDEBAR_VIEWS.tags}
        aria-label="Tags"
      >
        <Tags class="ActivityBar__icon" />
      </button>

      <button
        type="button"
        class="ActivityBar__button"
        class:ActivityBar__button--active={sidebar_open &&
          active_view === SIDEBAR_VIEWS.graph}
        onclick={() => on_open_view(SIDEBAR_VIEWS.graph)}
        aria-pressed={sidebar_open && active_view === SIDEBAR_VIEWS.graph}
        aria-label="Graph"
      >
        <Network class="ActivityBar__icon" />
      </button>

      <button
        type="button"
        class="ActivityBar__button"
        class:ActivityBar__button--active={sidebar_open &&
          active_view === SIDEBAR_VIEWS.source_control}
        onclick={() => on_open_view(SIDEBAR_VIEWS.source_control)}
        aria-pressed={sidebar_open &&
          active_view === SIDEBAR_VIEWS.source_control}
        aria-label="Source Control"
      >
        <GitBranch class="ActivityBar__icon" />
      </button>

      {#each dynamic_views as view (view.id)}
        <button
          type="button"
          class="ActivityBar__button"
          class:ActivityBar__button--active={sidebar_open &&
            active_view === view.id}
          onclick={() => on_open_view(view.id)}
          aria-pressed={sidebar_open && active_view === view.id}
          aria-label={view.label}
        >
          <view.icon class="ActivityBar__icon" />
        </button>
      {/each}
    {/if}
  </div>

  <div class="ActivityBar__section">
    <button
      type="button"
      class="ActivityBar__button"
      onclick={on_open_help}
      aria-label="Help"
    >
      <CircleHelp class="ActivityBar__icon" />
    </button>
    <button
      type="button"
      class="ActivityBar__button"
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
    padding-block: var(--space-1);
    background-color: var(--sidebar);
    border-inline-end: 1px solid var(--sidebar-border);
  }

  .ActivityBar__section {
    display: flex;
    flex-direction: column;
  }

  .ActivityBar__button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-activity-bar);
    height: var(--size-activity-bar);
    color: var(--sidebar-foreground);
    opacity: 0.35;
    transition:
      opacity var(--duration-normal) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .ActivityBar__button:hover {
    opacity: 1;
  }

  .ActivityBar__button:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .ActivityBar__button--active {
    opacity: 0.9;
  }

  .ActivityBar__button--active::before {
    content: "";
    position: absolute;
    inset-block: var(--space-2);
    inset-inline-start: 0;
    width: 2px;
    background-color: var(--interactive);
    border-radius: 1px;
  }

  :global(.ActivityBar__icon) {
    width: var(--size-activity-icon);
    height: var(--size-activity-icon);
  }
</style>
