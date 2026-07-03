<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import type { SidebarViewMeta } from "$lib/app";

  type Props = {
    open: boolean;
    views: SidebarViewMeta[];
    on_select: (id: string) => void;
    on_open_change: (open: boolean) => void;
  };

  let { open, views, on_select, on_open_change }: Props = $props();
</script>

<Dialog.Root {open} onOpenChange={on_open_change}>
  <Dialog.Content class="SidebarViewSwitcher">
    <Dialog.Header>
      <Dialog.Title>Go to Sidebar View</Dialog.Title>
      <Dialog.Description
        >Switch the activity bar to a different view</Dialog.Description
      >
    </Dialog.Header>

    <div class="SidebarViewSwitcher__list">
      {#each views as view (view.id)}
        <button
          type="button"
          class="SidebarViewSwitcher__item"
          onclick={() => on_select(view.id)}
        >
          <view.icon class="SidebarViewSwitcher__icon" />
          <span>{view.label}</span>
        </button>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  .SidebarViewSwitcher__list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-block-start: var(--space-2);
  }

  .SidebarViewSwitcher__item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    text-align: start;
    color: var(--foreground);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .SidebarViewSwitcher__item:hover,
  .SidebarViewSwitcher__item:focus-visible {
    background-color: var(--accent);
    outline: none;
  }

  :global(.SidebarViewSwitcher__icon) {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
</style>
