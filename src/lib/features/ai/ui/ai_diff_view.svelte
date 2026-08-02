<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { AiDraftDiff } from "$lib/features/ai/domain/ai_diff";
  import type { ProposalHunk } from "$lib/features/assistant";

  type Props = {
    diff: AiDraftDiff | null;
    selected_hunk_ids?: string[] | undefined;
    on_toggle_hunk?: ((hunk_id: string) => void) | undefined;
    on_select_all?: (() => void) | undefined;
    on_clear_selection?: (() => void) | undefined;
  };

  let {
    diff,
    selected_hunk_ids = [],
    on_toggle_hunk,
    on_select_all,
    on_clear_selection,
  }: Props = $props();

  function is_selected(hunk_id: string) {
    return selected_hunk_ids.includes(hunk_id);
  }

  function hunk_additions(hunk: ProposalHunk) {
    return hunk.lines.filter((line) => line.kind === "add").length;
  }

  function hunk_deletions(hunk: ProposalHunk) {
    return hunk.lines.filter((line) => line.kind === "del").length;
  }
</script>

{#if diff && diff.hunks.length > 0}
  <div class="AiDiffView">
    {#if on_toggle_hunk && diff.hunks.length > 1}
      <div class="AiDiffView__controls">
        <span class="AiDiffView__controls-label">
          {selected_hunk_ids.length} of {diff.hunks.length} change groups selected
        </span>
        <div class="AiDiffView__controls-actions">
          <Button variant="ghost" size="sm" onclick={on_select_all}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" onclick={on_clear_selection}>
            Clear
          </Button>
        </div>
      </div>
    {/if}
    {#each diff.hunks as hunk}
      <div class="AiDiffView__hunk">
        <div class="AiDiffView__header">
          <div class="AiDiffView__header-copy">
            {#if on_toggle_hunk}
              <label class="AiDiffView__toggle">
                <input
                  type="checkbox"
                  checked={is_selected(hunk.id)}
                  onchange={() => on_toggle_hunk(hunk.id)}
                />
                <span>Apply</span>
              </label>
            {/if}
            <span>{hunk.header}</span>
          </div>
          <div class="AiDiffView__summary">
            {#if hunk_additions(hunk) > 0}
              <span
                class="AiDiffView__summary-chip AiDiffView__summary-chip--addition"
              >
                +{hunk_additions(hunk)}
              </span>
            {/if}
            {#if hunk_deletions(hunk) > 0}
              <span
                class="AiDiffView__summary-chip AiDiffView__summary-chip--deletion"
              >
                -{hunk_deletions(hunk)}
              </span>
            {/if}
          </div>
        </div>
        {#each hunk.lines as line}
          <div
            class="AiDiffView__line"
            class:AiDiffView__line--addition={line.kind === "add"}
            class:AiDiffView__line--deletion={line.kind === "del"}
          >
            <span class="AiDiffView__gutter AiDiffView__gutter--old">
              {line.old_line ?? ""}
            </span>
            <span class="AiDiffView__gutter AiDiffView__gutter--new">
              {line.new_line ?? ""}
            </span>
            <span class="AiDiffView__content">{line.content}</span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
{:else}
  <div class="AiDiffView AiDiffView--empty">
    <span class="AiDiffView__placeholder">No changes to display</span>
  </div>
{/if}

<style>
  .AiDiffView {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    line-height: 1.5;
    overflow: auto;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
  }

  .AiDiffView--empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
  }

  .AiDiffView__placeholder {
    color: var(--muted-foreground);
    font-family: var(--font-sans, sans-serif);
    font-size: var(--text-sm);
  }

  .AiDiffView__controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    background-color: color-mix(in oklch, var(--muted) 55%, transparent);
  }

  .AiDiffView__controls-label {
    color: var(--muted-foreground);
    font-family: var(--font-sans, sans-serif);
    font-size: var(--text-xs);
  }

  .AiDiffView__controls-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .AiDiffView__hunk {
    border-bottom: 1px solid var(--border);
  }

  .AiDiffView__hunk:last-child {
    border-bottom: none;
  }

  .AiDiffView__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    background-color: var(--muted);
    color: var(--muted-foreground);
    font-size: var(--text-xs);
    user-select: none;
  }

  .AiDiffView__header-copy {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .AiDiffView__toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-sans, sans-serif);
    color: var(--foreground);
  }

  .AiDiffView__summary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .AiDiffView__summary-chip {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-1);
    font-family: var(--font-sans, sans-serif);
  }

  .AiDiffView__summary-chip--addition {
    color: oklch(0.62 0.17 149);
  }

  .AiDiffView__summary-chip--deletion {
    color: var(--destructive);
  }

  .AiDiffView__line {
    display: flex;
    min-height: 1.5em;
  }

  .AiDiffView__line--addition {
    background-color: color-mix(in oklch, var(--chart-2) 15%, transparent);
  }

  .AiDiffView__line--deletion {
    background-color: color-mix(in oklch, var(--destructive) 15%, transparent);
  }

  .AiDiffView__gutter {
    display: inline-flex;
    justify-content: flex-end;
    width: 3em;
    padding-inline: var(--space-1);
    color: var(--muted-foreground);
    user-select: none;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .AiDiffView__gutter--old {
    border-inline-end: 1px solid var(--border);
  }

  .AiDiffView__gutter--new {
    border-inline-end: 1px solid var(--border);
  }

  .AiDiffView__content {
    padding-inline: var(--space-2);
    white-space: pre;
  }
</style>
