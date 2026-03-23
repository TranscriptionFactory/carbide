<script lang="ts">
  import type { QueryResultItem } from "../types";

  let {
    items,
    onopen,
  }: { items: QueryResultItem[]; onopen: (path: string) => void } = $props();
</script>

<div class="QueryResultList">
  {#each items as item (item.note.path)}
    <button
      type="button"
      class="QueryResultList__item"
      onclick={() => onopen(item.note.path)}
      title={item.note.path}
    >
      <span class="QueryResultList__title">{item.note.title}</span>
      <span class="QueryResultList__path">{item.note.path}</span>
    </button>
  {:else}
    <div class="QueryResultList__empty">No results</div>
  {/each}
</div>

<style>
  .QueryResultList {
    display: flex;
    flex-direction: column;
  }

  .QueryResultList__item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    text-align: left;
    border-radius: var(--radius-sm);
    color: var(--foreground);
  }

  .QueryResultList__item:hover {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  .QueryResultList__title {
    font-weight: 500;
    flex-shrink: 0;
  }

  .QueryResultList__path {
    color: var(--muted-foreground);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .QueryResultList__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }
</style>
