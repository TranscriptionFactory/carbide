<script lang="ts">
  import { Check, Loader2, Wrench, X } from "@lucide/svelte";
  import type { AssistantToolEvent } from "$lib/features/assistant/types/session";
  import {
    tool_event_has_body,
    tool_event_status,
    type ToolEventStatus,
  } from "$lib/features/assistant/types/tool_event_fold";

  type Props = {
    event: AssistantToolEvent;
    on_open_path: (path: string) => void;
  };
  let { event, on_open_path }: Props = $props();

  const COMPLETION_CHECK_MS = 1400;

  const status = $derived(tool_event_status(event));

  // Collapsed by default, failures excepted: the spinner already says a call
  // is live, and an error is the one body worth showing unasked.
  let open = $state(false);
  let user_toggled = false;
  let check_visible = $state(false);
  let prev_status: ToolEventStatus | null = null;

  // Keyed on the live transition, never mount state: a replayed transcript
  // mounts every call already settled, and would otherwise flash a run of
  // checks at once and expand every historical failure.
  $effect(() => {
    const current = status;
    const prev = prev_status;
    prev_status = current;
    if (prev === null || prev === current) return undefined;
    if (current === "failed" && !user_toggled) open = true;
    if (current !== "completed") return undefined;
    check_visible = true;
    const timer = setTimeout(
      () => (check_visible = false),
      COMPLETION_CHECK_MS,
    );
    return () => clearTimeout(timer);
  });

  function toggle_open() {
    user_toggled = true;
    open = !open;
  }

  const paths = $derived(event.paths ?? []);
  const has_body = $derived(tool_event_has_body(event));
  const expanded = $derived(open && has_body);
</script>

{#snippet row()}
  <Wrench class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
  <span class="shrink-0 font-medium text-foreground">{event.name}</span>
  <span class="truncate text-muted-foreground">{event.input_summary}</span>
  <span class="ml-auto flex shrink-0 items-center gap-1.5">
    {#if status === "running"}
      <Loader2 class="size-3.5 animate-spin" aria-label="Running" />
    {:else if status === "failed"}
      <X class="size-3.5 text-destructive" aria-label="Failed" />
    {:else if check_visible}
      <span
        class="completion-check"
        style="animation-duration: {COMPLETION_CHECK_MS}ms"
        aria-label="Succeeded"
      >
        <Check class="size-3.5" />
      </span>
    {/if}
  </span>
{/snippet}

<div
  class="text-xs {expanded ? 'rounded-md border' : ''}"
  data-testid="assistant-tool-call"
>
  {#if has_body}
    <button
      type="button"
      class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-accent/50"
      onclick={toggle_open}
      aria-expanded={open}
    >
      {@render row()}
    </button>
  {:else}
    <!-- Nothing to reveal — a row of text, not a control that only ever
         reports itself disabled. -->
    <div class="flex w-full items-center gap-1.5 px-2 py-1.5">
      {@render row()}
    </div>
  {/if}
  {#if expanded}
    <div class="flex select-text flex-col gap-1.5 border-t px-2 py-1.5">
      <div class="break-words text-muted-foreground">{event.input_summary}</div>
      {#if event.result_summary}
        <pre
          class="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/50 px-2 py-1 font-mono text-[11px]">{event.result_summary}</pre>
      {/if}
      {#if paths.length > 0}
        <div class="flex flex-wrap gap-1">
          {#each paths as path (path)}
            <button
              type="button"
              class="rounded bg-muted/50 px-1 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onclick={() => on_open_path(path)}
            >
              {path}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Duration comes from the inline animation-duration, which shares
     COMPLETION_CHECK_MS with the unmount timer — one source for both. */
  .completion-check {
    animation: completion-fade ease-out forwards;
  }
  @keyframes completion-fade {
    0%,
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
</style>
