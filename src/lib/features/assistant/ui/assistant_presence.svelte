<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import AssistantRunsPopover from "./assistant_runs_popover.svelte";
  import type { RunId, RunRecord } from "$lib/features/assistant/types/run";

  interface Props {
    runs: RunRecord[];
    on_stop: (id: RunId) => void;
    now?: (() => number) | undefined;
    detached_ids?: ReadonlySet<RunId> | undefined;
  }

  let { runs, on_stop, now, detached_ids }: Props = $props();

  const active_count = $derived(
    runs.filter(
      (run) => run.status === "starting" || run.status === "streaming",
    ).length,
  );
  const errors = $derived(runs.filter((run) => run.status === "error"));
  const first_error_message = $derived(errors[0]?.error?.message ?? null);

  const label = $derived.by(() => {
    if (errors.length > 0)
      return `${errors.length} error${errors.length > 1 ? "s" : ""}`;
    if (active_count === 0) return "ready";
    return `${active_count} run${active_count > 1 ? "s" : ""}`;
  });

  const description = $derived(
    first_error_message
      ? `Assistant: ${label} — ${first_error_message}`
      : `Assistant: ${label}`,
  );
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="AssistantPresence"
        class:AssistantPresence--error={errors.length > 0}
        class:AssistantPresence--active={active_count > 0}
        data-testid="status-assistant-presence"
        title={description}
        aria-label={description}
      >
        <span class="AssistantPresence__spark" aria-hidden="true">✦</span>
        <span class="AssistantPresence__label">{label}</span>
        <span
          class="AssistantPresence__dot"
          class:AssistantPresence__dot--streaming={active_count > 0 &&
            errors.length === 0}
          class:AssistantPresence__dot--error={errors.length > 0}
        ></span>
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    class="AssistantPresence__content"
    align="end"
    sideOffset={8}
  >
    <AssistantRunsPopover {runs} {on_stop} {now} {detached_ids} />
  </Popover.Content>
</Popover.Root>

<style>
  .AssistantPresence {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-feature-settings: "tnum" 1;
    color: var(--muted-foreground);
    opacity: 0.7;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .AssistantPresence:hover {
    opacity: 1;
    color: var(--interactive);
  }

  .AssistantPresence:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .AssistantPresence--active {
    opacity: 1;
  }

  .AssistantPresence--error {
    color: var(--destructive);
    opacity: 0.85;
  }

  .AssistantPresence--error:hover {
    color: var(--destructive);
    opacity: 1;
  }

  .AssistantPresence__spark {
    color: var(--primary);
  }

  .AssistantPresence--error .AssistantPresence__spark {
    color: var(--destructive);
  }

  .AssistantPresence__dot {
    width: var(--space-1-5);
    height: var(--space-1-5);
    border-radius: 50%;
    flex-shrink: 0;
    background-color: var(--indicator-clean);
    transition: background-color var(--duration-normal) var(--ease-default);
  }

  .AssistantPresence__dot--streaming {
    background-color: var(--primary);
    animation: AssistantPresence__pulse 1.4s var(--ease-default) infinite;
  }

  .AssistantPresence__dot--error {
    background-color: var(--destructive);
  }

  @keyframes AssistantPresence__pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
</style>
