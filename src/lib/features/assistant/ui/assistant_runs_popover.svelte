<script lang="ts">
  import AssistantStopButton from "./assistant_stop_button.svelte";
  import { note_name_from_path } from "$lib/shared/utils/path";
  import type {
    RunId,
    RunKind,
    RunRecord,
  } from "$lib/features/assistant/types/run";

  interface Props {
    runs: RunRecord[];
    on_stop: (id: RunId) => void;
    now?: (() => number) | undefined;
    detached_ids?: ReadonlySet<RunId> | undefined;
  }

  let {
    runs,
    on_stop,
    now = () => Date.now(),
    detached_ids = new Set<RunId>(),
  }: Props = $props();

  const KIND_GLYPHS: Record<RunKind, string> = {
    inline: "⌁",
    note: "▤",
    chat: "◈",
    agent: "◈",
    background: "▤",
  };

  const TICK_MS = 1000;

  let tick = $state(0);

  $effect(() => {
    const timer = setInterval(() => {
      tick += 1;
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  });

  // `tick` is read only to make the clock a reactive dependency; the value is
  // the injected clock, so tests can pin it without timers.
  const now_ms = $derived.by(() => {
    void tick;
    return now();
  });

  function is_live(run: RunRecord): boolean {
    return (
      run.status === "starting" ||
      run.status === "streaming" ||
      run.status === "stopping"
    );
  }

  function format_elapsed(started_at: number, at: number): string {
    const seconds = Math.max(0, Math.floor((at - started_at) / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function row_name(run: RunRecord): string {
    const note_path = run.origin.note_path;
    return note_path
      ? `${run.label} · ${note_name_from_path(note_path)}`
      : run.label;
  }

  function sub_line(run: RunRecord): string {
    if (run.status === "error") return run.error?.message ?? "Run failed";
    if (detached_ids.has(run.id)) return `${run.status} — run detached`;
    return `${run.status} · ${run.kind}`;
  }

  const rows = $derived(
    runs
      .filter((run) => is_live(run) || run.status === "error")
      .sort((a, b) => a.started_at - b.started_at),
  );
</script>

<div class="AssistantRuns" data-testid="assistant-runs-popover">
  <div class="AssistantRuns__head">
    <span>Active runs</span>
    <span class="AssistantRuns__brand"
      ><span class="AssistantRuns__spark" aria-hidden="true">✦</span> Assistant</span
    >
  </div>

  {#if rows.length === 0}
    <p class="AssistantRuns__empty" data-testid="assistant-runs-empty">
      No active runs
    </p>
  {:else}
    <ul class="AssistantRuns__list">
      {#each rows as run (run.id)}
        <li
          class="AssistantRuns__row"
          class:AssistantRuns__row--error={run.status === "error"}
          data-testid="assistant-run-row"
          data-run-id={run.id}
          data-kind={run.kind}
        >
          <span class="AssistantRuns__kind" aria-hidden="true"
            >{KIND_GLYPHS[run.kind]}</span
          >
          <span class="AssistantRuns__desc">
            <span class="AssistantRuns__name">{row_name(run)}</span>
            <span class="AssistantRuns__sub" data-testid="assistant-run-sub"
              >{sub_line(run)}</span
            >
          </span>
          <span
            class="AssistantRuns__elapsed"
            data-testid="assistant-run-elapsed"
            >{format_elapsed(run.started_at, now_ms)}</span
          >
          <AssistantStopButton {run} {on_stop} />
        </li>
      {/each}
    </ul>
    <p class="AssistantRuns__note">
      Runs belong to the kernel, not the window that started them. Closing a
      surface detaches its view; the work continues here.
    </p>
  {/if}
</div>

<style>
  .AssistantRuns {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--text-xs);
  }

  .AssistantRuns__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--muted-foreground);
  }

  .AssistantRuns__brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .AssistantRuns__spark {
    color: var(--primary);
  }

  .AssistantRuns__empty {
    color: var(--muted-foreground);
    opacity: 0.7;
  }

  .AssistantRuns__list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .AssistantRuns__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
  }

  .AssistantRuns__row:hover {
    background-color: var(--muted);
  }

  .AssistantRuns__kind {
    color: var(--primary);
    flex-shrink: 0;
  }

  .AssistantRuns__desc {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .AssistantRuns__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .AssistantRuns__sub {
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .AssistantRuns__row--error .AssistantRuns__sub {
    color: var(--destructive);
  }

  .AssistantRuns__elapsed {
    color: var(--muted-foreground);
    font-feature-settings: "tnum" 1;
    flex-shrink: 0;
  }

  .AssistantRuns__note {
    color: var(--muted-foreground);
    opacity: 0.7;
    border-top: 1px solid var(--border);
    padding-top: var(--space-2);
  }
</style>
