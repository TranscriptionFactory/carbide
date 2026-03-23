<script lang="ts">
  import type { QueryResultItem } from "../types";

  let {
    items,
    onopen,
  }: { items: QueryResultItem[]; onopen: (path: string) => void } = $props();

  function format_relative_time(mtime_ms: number): string {
    if (!mtime_ms) return "";
    const delta_ms = Date.now() - mtime_ms;
    const mins = Math.floor(delta_ms / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(mtime_ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function format_size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function folder_from_path(path: string): string {
    const idx = path.lastIndexOf("/");
    return idx > 0 ? path.substring(0, idx) : "";
  }
</script>

<div class="QueryResultFeed">
  {#each items as item (item.note.path)}
    <button
      type="button"
      class="QueryResultFeed__item"
      onclick={() => onopen(item.note.path)}
    >
      <div class="QueryResultFeed__header">
        <span class="QueryResultFeed__title">{item.note.title}</span>
        <span class="QueryResultFeed__time"
          >{format_relative_time(item.note.mtime_ms)}</span
        >
      </div>
      <div class="QueryResultFeed__details">
        {#if folder_from_path(item.note.path)}
          <span class="QueryResultFeed__folder"
            >{folder_from_path(item.note.path)}</span
          >
        {/if}
        {#if item.note.size_bytes}
          <span>{format_size(item.note.size_bytes)}</span>
        {/if}
      </div>
      {#if item.matched_clauses.length > 0}
        <div class="QueryResultFeed__clauses">
          {#each item.matched_clauses as clause}
            <span class="QueryResultFeed__clause">{clause}</span>
          {/each}
        </div>
      {/if}
    </button>
  {:else}
    <div class="QueryResultFeed__empty">No results</div>
  {/each}
</div>

<style>
  .QueryResultFeed {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .QueryResultFeed__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    padding: var(--space-2) var(--space-3);
    text-align: left;
    border-radius: var(--radius-sm);
    color: var(--foreground);
    border-bottom: 1px solid var(--border);
  }

  .QueryResultFeed__item:last-child {
    border-bottom: none;
  }

  .QueryResultFeed__item:hover {
    background-color: var(--accent);
  }

  .QueryResultFeed__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .QueryResultFeed__title {
    font-size: var(--text-sm);
    font-weight: 500;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .QueryResultFeed__time {
    font-size: 10px;
    color: var(--muted-foreground);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .QueryResultFeed__details {
    display: flex;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .QueryResultFeed__folder {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .QueryResultFeed__clauses {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .QueryResultFeed__clause {
    font-size: 10px;
    padding: 1px var(--space-1);
    background-color: var(--muted);
    color: var(--muted-foreground);
    border-radius: var(--radius-sm);
  }

  .QueryResultFeed__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 80px;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }
</style>
