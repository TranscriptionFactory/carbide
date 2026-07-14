<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { OutlineHeading } from "$lib/features/outline/types/outline";
  import {
    compute_active_heading_id,
    compute_visible_headings,
  } from "$lib/features/outline/domain/outline_view";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ListTreeIcon from "@lucide/svelte/icons/list-tree";
  import { onDestroy } from "svelte";

  const { stores, action_registry } = use_app_context();

  const headings = $derived(stores.outline.headings);
  const active_heading_id = $derived(stores.outline.active_heading_id);
  const collapsed_ids = $derived(stores.outline.collapsed_ids);

  let scroll_raf: number | undefined;
  let cached_heading_tops: number[] = [];
  let heading_tops_raf: number | undefined;
  let list_element = $state<HTMLElement>();

  $effect(() => {
    if (!active_heading_id) return;
    const item = list_element?.querySelector(".OutlinePanel__item--active");
    item?.scrollIntoView({ block: "nearest" });
  });

  function find_editor_scroll_container(): HTMLElement | null {
    return document.querySelector(".NoteEditor");
  }

  function compute_heading_tops() {
    heading_tops_raf = undefined;
    const container = find_editor_scroll_container();
    if (!container || headings.length === 0) {
      cached_heading_tops = [];
      return;
    }

    const heading_elements = container.querySelectorAll(
      "h1, h2, h3, h4, h5, h6",
    );
    const container_rect = container.getBoundingClientRect();
    const scroll_top = container.scrollTop;

    cached_heading_tops = Array.from(heading_elements).map((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top - container_rect.top + scroll_top;
    });
  }

  function update_active_heading() {
    const container = find_editor_scroll_container();
    if (!container) {
      stores.outline.set_active_heading(null);
      return;
    }

    stores.outline.set_active_heading(
      compute_active_heading_id(
        headings,
        cached_heading_tops,
        container.scrollTop,
        container.scrollHeight - container.clientHeight,
      ),
    );
  }

  function handle_scroll() {
    if (scroll_raf) return;
    scroll_raf = requestAnimationFrame(() => {
      scroll_raf = undefined;
      update_active_heading();
    });
  }

  let current_scroll_container: HTMLElement | null = null;
  let resize_observer: ResizeObserver | undefined;

  function queue_heading_tops() {
    if (heading_tops_raf) cancelAnimationFrame(heading_tops_raf);
    heading_tops_raf = requestAnimationFrame(() => {
      compute_heading_tops();
      update_active_heading();
    });
  }

  $effect(() => {
    void headings.length;
    queue_heading_tops();
  });

  $effect(() => {
    void headings.length;
    const container = find_editor_scroll_container();
    if (container !== current_scroll_container) {
      current_scroll_container?.removeEventListener("scroll", handle_scroll);
      current_scroll_container = container;
      container?.addEventListener("scroll", handle_scroll, { passive: true });
      resize_observer?.disconnect();
      if (container) {
        resize_observer = new ResizeObserver(queue_heading_tops);
        resize_observer.observe(container);
        const content = container.querySelector(".NoteEditor__content");
        if (content) resize_observer.observe(content);
      }
    }

    return () => {
      current_scroll_container?.removeEventListener("scroll", handle_scroll);
      current_scroll_container = null;
      resize_observer?.disconnect();
      resize_observer = undefined;
    };
  });

  onDestroy(() => {
    if (scroll_raf) cancelAnimationFrame(scroll_raf);
    if (heading_tops_raf) cancelAnimationFrame(heading_tops_raf);
    current_scroll_container?.removeEventListener("scroll", handle_scroll);
    resize_observer?.disconnect();
  });

  const visible_headings = $derived(
    compute_visible_headings(headings, collapsed_ids),
  );

  function has_children(heading: OutlineHeading): boolean {
    const idx = headings.indexOf(heading);
    if (idx < 0 || idx >= headings.length - 1) return false;
    const next = headings[idx + 1];
    return next !== undefined && next.level > heading.level;
  }

  function handle_click(heading: OutlineHeading) {
    void action_registry.execute(
      ACTION_IDS.outline_scroll_to_heading,
      heading.pos,
    );
  }

  function toggle_collapsed(event: Event, heading: OutlineHeading) {
    event.stopPropagation();
    stores.outline.toggle_collapsed(heading.id);
  }
</script>

<div class="OutlinePanel">
  {#if headings.length === 0}
    <div class="OutlinePanel__empty">
      <div class="OutlinePanel__empty-icon">
        <ListTreeIcon />
      </div>
      <p class="OutlinePanel__empty-text">No headings</p>
    </div>
  {:else}
    <nav class="OutlinePanel__list" bind:this={list_element}>
      {#each visible_headings as heading (heading.id)}
        <button
          type="button"
          class="OutlinePanel__item"
          class:OutlinePanel__item--active={heading.id === active_heading_id}
          style="padding-inline-start: {(heading.level - 1) * 12 + 8}px"
          onclick={() => handle_click(heading)}
        >
          {#if has_children(heading)}
            <span
              role="button"
              tabindex="-1"
              class="OutlinePanel__chevron"
              class:OutlinePanel__chevron--collapsed={collapsed_ids.has(
                heading.id,
              )}
              onclick={(e) => toggle_collapsed(e, heading)}
              onkeydown={(e) => {
                if (e.key === "Enter") toggle_collapsed(e, heading);
              }}
            >
              <ChevronRightIcon />
            </span>
          {:else}
            <span class="OutlinePanel__chevron-spacer"></span>
          {/if}
          <span class="OutlinePanel__item-text">
            {heading.text || "(empty heading)"}
          </span>
        </button>
      {/each}
    </nav>
  {/if}
</div>

<style>
  .OutlinePanel {
    height: 100%;
    overflow-y: auto;
    padding-block: var(--space-1);
  }

  .OutlinePanel__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6);
    color: var(--muted-foreground);
  }

  .OutlinePanel__empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--size-icon-lg) * 1.5);
    height: calc(var(--size-icon-lg) * 1.5);
  }

  :global(.OutlinePanel__empty-icon svg) {
    width: var(--size-icon-lg);
    height: var(--size-icon-lg);
  }

  .OutlinePanel__empty-text {
    font-size: var(--text-sm);
  }

  .OutlinePanel__list {
    display: flex;
    flex-direction: column;
  }

  .OutlinePanel__item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    border: none;
    background: none;
    cursor: pointer;
    padding-block: var(--space-1);
    padding-inline-end: var(--space-2);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    text-align: start;
    line-height: 1.4;
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .OutlinePanel__item:hover {
    color: var(--foreground);
    background-color: var(--accent);
  }

  .OutlinePanel__item--active {
    color: var(--interactive);
    font-weight: 500;
  }

  .OutlinePanel__chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
    border: none;
    background: none;
    cursor: pointer;
    padding: 0;
    color: inherit;
    transition: transform var(--duration-fast) var(--ease-default);
    transform: rotate(90deg);
  }

  .OutlinePanel__chevron--collapsed {
    transform: rotate(0deg);
  }

  :global(.OutlinePanel__chevron svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .OutlinePanel__chevron-spacer {
    flex-shrink: 0;
    width: var(--size-icon-sm);
  }

  .OutlinePanel__item-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
