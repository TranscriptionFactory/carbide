<script lang="ts">
  import {
    type GitCommit,
    CHECKPOINT_PREFIX,
  } from "$lib/features/git/types/git";

  type Props = {
    commits: GitCommit[];
    has_more: boolean;
    is_loading_more: boolean;
    on_load_more: () => void;
  };

  let { commits, has_more, is_loading_more, on_load_more }: Props = $props();

  type DayGroup = {
    label: string;
    commits: GitCommit[];
  };

  const grouped = $derived.by(() => {
    const groups: DayGroup[] = [];
    const now = new Date();
    const today_str = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterday_str = yesterday.toDateString();

    let current_label = "";
    let current_group: GitCommit[] = [];

    for (const commit of commits) {
      const date = new Date(commit.timestamp_ms);
      const date_str = date.toDateString();
      const label =
        date_str === today_str
          ? "Today"
          : date_str === yesterday_str
            ? "Yesterday"
            : date.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

      if (label !== current_label) {
        if (current_group.length > 0) {
          groups.push({ label: current_label, commits: current_group });
        }
        current_label = label;
        current_group = [];
      }
      current_group.push(commit);
    }

    if (current_group.length > 0) {
      groups.push({ label: current_label, commits: current_group });
    }

    return groups;
  });

  function format_time(timestamp_ms: number): string {
    return new Date(timestamp_ms).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function is_checkpoint(message: string): boolean {
    return message.startsWith(CHECKPOINT_PREFIX);
  }
</script>

<div class="CheckpointHistory">
  {#each grouped as group (group.label)}
    <div class="CheckpointHistory__group">
      <div class="CheckpointHistory__day-label">{group.label}</div>
      <div class="CheckpointHistory__timeline">
        {#each group.commits as commit (commit.hash)}
          <div class="CheckpointHistory__entry">
            <div
              class="CheckpointHistory__dot"
              class:CheckpointHistory__dot--checkpoint={is_checkpoint(
                commit.message,
              )}
            ></div>
            <div class="CheckpointHistory__content">
              <span class="CheckpointHistory__message">{commit.message}</span>
              <span class="CheckpointHistory__meta">
                {commit.short_hash} · {format_time(commit.timestamp_ms)}
              </span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/each}

  {#if has_more}
    <button
      type="button"
      class="CheckpointHistory__load-more"
      disabled={is_loading_more}
      onclick={on_load_more}
    >
      {is_loading_more ? "Loading..." : "Load more"}
    </button>
  {/if}

  {#if commits.length === 0}
    <div class="CheckpointHistory__empty">No checkpoints yet</div>
  {/if}
</div>

<style>
  .CheckpointHistory {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
  }

  .CheckpointHistory__group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .CheckpointHistory__day-label {
    font-size: var(--text-2xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    padding-inline-start: var(--space-4);
  }

  .CheckpointHistory__timeline {
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .CheckpointHistory__timeline::before {
    content: "";
    position: absolute;
    inset-inline-start: 7px;
    inset-block: 8px;
    width: 1px;
    background-color: var(--border);
  }

  .CheckpointHistory__entry {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    border-radius: var(--radius-sm);
    position: relative;
  }

  .CheckpointHistory__entry:hover {
    background-color: var(--accent);
  }

  .CheckpointHistory__dot {
    flex-shrink: 0;
    width: 7px;
    height: 7px;
    margin-block-start: 5px;
    margin-inline-start: 4px;
    border-radius: 50%;
    background-color: var(--muted-foreground);
    position: relative;
    z-index: 1;
  }

  .CheckpointHistory__dot--checkpoint {
    background-color: var(--interactive);
  }

  .CheckpointHistory__content {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .CheckpointHistory__message {
    font-size: var(--text-xs);
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .CheckpointHistory__meta {
    font-size: var(--text-2xs);
    color: var(--muted-foreground);
    font-family: var(--font-mono);
  }

  .CheckpointHistory__load-more {
    font-size: var(--text-xs);
    color: var(--interactive);
    padding: var(--space-1);
    text-align: center;
    border-radius: var(--radius-sm);
  }

  .CheckpointHistory__load-more:hover {
    background-color: var(--accent);
  }

  .CheckpointHistory__load-more:disabled {
    opacity: 0.5;
  }

  .CheckpointHistory__empty {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    text-align: center;
    padding: var(--space-4);
  }
</style>
