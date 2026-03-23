<script lang="ts">
  import type { QueryResultItem } from "../types";

  let {
    items,
    onopen,
  }: { items: QueryResultItem[]; onopen: (path: string) => void } = $props();

  function format_date(mtime_ms: number): string {
    if (!mtime_ms) return "";
    return new Date(mtime_ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function format_size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
</script>

<div class="QueryResultCards">
  {#each items as item (item.note.path)}
    <button
      type="button"
      class="QueryResultCards__card"
      onclick={() => onopen(item.note.path)}
      title={item.note.path}
    >
      <span class="QueryResultCards__title">{item.note.title}</span>
      <span class="QueryResultCards__path">{item.note.path}</span>
      <div class="QueryResultCards__meta">
        {#if item.note.mtime_ms}
          <span>{format_date(item.note.mtime_ms)}</span>
        {/if}
        {#if item.note.size_bytes}
          <span>{format_size(item.note.size_bytes)}</span>
        {/if}
      </div>
      {#if item.matched_clauses.length > 0}
        <div class="QueryResultCards__clauses">
          {#each item.matched_clauses as clause}
            <span class="QueryResultCards__clause">{clause}</span>
          {/each}
        </div>
      {/if}
    </button>
  {:else}
    <div class="QueryResultCards__empty">No results</div>
  {/each}
</div>

<style>
  .QueryResultCards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-2);
    padding: var(--space-1);
  }

  .QueryResultCards__card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    text-align: left;
    background-color: var(--card);
    color: var(--card-foreground);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .QueryResultCards__card:hover {
    border-color: var(--ring);
    background-color: var(--accent);
  }

  .QueryResultCards__title {
    font-size: var(--text-sm);
    font-weight: 500;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .QueryResultCards__path {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .QueryResultCards__meta {
    display: flex;
    gap: var(--space-2);
    font-size: 10px;
    color: var(--muted-foreground);
  }

  .QueryResultCards__clauses {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: var(--space-0-5);
  }

  .QueryResultCards__clause {
    font-size: 10px;
    padding: 1px var(--space-1);
    background-color: var(--muted);
    color: var(--muted-foreground);
    border-radius: var(--radius-sm);
  }

  .QueryResultCards__empty {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 80px;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }
</style>
