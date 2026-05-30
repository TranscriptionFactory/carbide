<script lang="ts">
  import type { NoteMeta } from "$lib/shared/types/note";

  let {
    note,
    visible,
    x,
    y,
  }: {
    note: NoteMeta | null;
    visible: boolean;
    x: number;
    y: number;
  } = $props();
</script>

{#if visible && note}
  <div
    class="PeekTooltip"
    style="left: {x}px; top: {y}px;"
    role="tooltip"
    aria-hidden={!visible}
  >
    <div class="PeekTooltip__title">{note.title || note.name}</div>
    <div class="PeekTooltip__path">{note.path}</div>
    {#if note.blurb}
      <div class="PeekTooltip__blurb">{note.blurb}</div>
    {/if}
  </div>
{/if}

<style>
  .PeekTooltip {
    position: fixed;
    z-index: 1000;
    max-width: 320px;
    pointer-events: none;
    padding: 0.5rem 0.625rem;
    background: var(--popover, var(--background));
    color: var(--popover-foreground, var(--foreground));
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    font-size: 0.75rem;
    line-height: 1.35;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .PeekTooltip__title {
    font-weight: 600;
  }
  .PeekTooltip__path {
    font-size: 0.625rem;
    color: var(--muted-foreground);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .PeekTooltip__blurb {
    color: var(--muted-foreground);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
