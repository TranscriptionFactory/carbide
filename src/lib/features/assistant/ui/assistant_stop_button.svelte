<script lang="ts">
  import { Square } from "@lucide/svelte";
  import type { RunId, RunRecord } from "$lib/features/assistant/types/run";

  interface Props {
    run: RunRecord;
    on_stop: (id: RunId) => void;
    hint?: string | undefined;
  }

  let { run, on_stop, hint }: Props = $props();

  const is_terminated = $derived(
    run.status === "done" || run.status === "error" || run.status === "aborted",
  );
  const is_stopping = $derived(run.status === "stopping");
</script>

{#if !is_terminated}
  <button
    type="button"
    class="AssistantStopButton"
    data-testid="assistant-stop-{run.id}"
    disabled={is_stopping}
    onclick={() => {
      on_stop(run.id);
    }}
    aria-label="Stop {run.label}"
  >
    <Square class="AssistantStopButton__icon" />
    <span>{is_stopping ? "Stopping" : "Stop"}</span>
    {#if hint}
      <kbd class="AssistantStopButton__hint">{hint}</kbd>
    {/if}
  </button>
{/if}

<style>
  .AssistantStopButton {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    opacity: 0.7;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .AssistantStopButton:hover:not(:disabled) {
    opacity: 1;
    color: var(--destructive);
  }

  .AssistantStopButton:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .AssistantStopButton:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.AssistantStopButton__icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    fill: currentcolor;
  }

  .AssistantStopButton__hint {
    font-size: var(--text-xs);
    line-height: 1;
    padding: 1px var(--space-1);
    border-radius: var(--radius-sm);
    background-color: var(--muted);
    color: var(--muted-foreground);
  }
</style>
