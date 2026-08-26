<script lang="ts" module>
  import {
    Brain,
    Check,
    FileText,
    Globe,
    Loader2,
    MoveRight,
    Pencil,
    Repeat,
    Search,
    SquareTerminal,
    Trash2,
    Wrench,
    X,
  } from "@lucide/svelte";
  import type { ToolKind } from "$lib/features/assistant/types/agent_events";

  const COMPLETION_CHECK_MS = 1400;

  const KIND_ICONS: Record<ToolKind, typeof Wrench> = {
    read: FileText,
    edit: Pencil,
    delete: Trash2,
    move: MoveRight,
    search: Search,
    execute: SquareTerminal,
    think: Brain,
    fetch: Globe,
    switch_mode: Repeat,
    other: Wrench,
  };

  type PathChip = { path: string; line?: number | null };
</script>

<script lang="ts">
  import type { AssistantToolEvent } from "$lib/features/assistant/types/session";
  import {
    is_placeholder_summary,
    tool_event_has_body,
    tool_event_status,
    type ToolEventStatus,
  } from "$lib/features/assistant/types/tool_event_fold";
  import {
    classify_outcome,
    outcome_line,
    type PermissionResponse,
  } from "$lib/features/assistant/domain/permission_outcome";
  import InlineDiff from "$lib/features/assistant/ui/inline_diff.svelte";
  import PermissionPrompt from "$lib/features/assistant/ui/permission_prompt.svelte";
  import TerminalBlock from "$lib/features/assistant/ui/terminal_block.svelte";

  type Props = {
    event: AssistantToolEvent;
    on_open_path: (path: string) => void;
    on_permission_respond?:
      | ((request_id: string, response: PermissionResponse) => void)
      | undefined;
    on_allow_everything?: (() => void) | undefined;
    // A prompt on a freshly loaded transcript is an orphan — nothing is
    // parked behind it — and renders as "no longer active" instead of live
    // buttons.
    live?: boolean;
  };
  let {
    event,
    on_open_path,
    on_permission_respond = undefined,
    on_allow_everything = undefined,
    live = false,
  }: Props = $props();

  const status = $derived(tool_event_status(event));
  const Icon = $derived(KIND_ICONS[event.kind ?? "other"]);
  const content = $derived(event.content ?? []);

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

  // Locations carry the same path plus a line; when the agent sent only
  // paths they render as the same chip without the suffix.
  const chips = $derived<PathChip[]>(
    event.locations?.length
      ? event.locations
      : (event.paths ?? []).map((path) => ({ path })),
  );
  const permission = $derived(event.permission);
  const pending_permission = $derived(
    permission !== undefined && permission.resolved === undefined,
  );
  const denied = $derived(
    permission?.resolved !== undefined &&
      classify_outcome(permission.resolved.outcome) === "denied",
  );
  const has_body = $derived(
    tool_event_has_body(event) || permission !== undefined,
  );
  // A call whose arguments never arrived has nothing to say about them; `{}` is
  // the placeholder the first wire frame carried, not the tool's input.
  const summary = $derived(
    is_placeholder_summary(event.input_summary) ? "" : event.input_summary,
  );
  // A pending prompt must be visible and answerable; it overrides collapse.
  const expanded = $derived((open || pending_permission) && has_body);
</script>

{#snippet row()}
  <Icon class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
  <span class="shrink-0 font-medium text-foreground">{event.name}</span>
  {#if summary}
    <span class="truncate text-muted-foreground">{summary}</span>
  {/if}
  <span class="ml-auto flex shrink-0 items-center gap-1.5">
    {#if denied}
      <span class="text-[10px] font-medium text-destructive">denied</span>
    {/if}
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
      class="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-accent/50"
      onclick={toggle_open}
      aria-expanded={open}
    >
      {@render row()}
    </button>
  {:else}
    <!-- Nothing to reveal — a row of text, not a control that only ever
         reports itself disabled. -->
    <div class="flex w-full items-center gap-1.5 px-2 py-1">
      {@render row()}
    </div>
  {/if}
  {#if expanded}
    <div class="flex select-text flex-col gap-1.5 border-t px-2 py-1.5">
      {#if summary}
        <div class="break-words text-muted-foreground">{summary}</div>
      {/if}
      {#if permission && pending_permission}
        {#if live && on_permission_respond}
          <div class="flex flex-col gap-1">
            <span class="text-muted-foreground"
              >Agent wants to run this tool</span
            >
            <PermissionPrompt
              options={permission.options}
              on_respond={(choice) =>
                on_permission_respond?.(permission.request_id, choice)}
              {on_allow_everything}
            />
          </div>
        {:else}
          <span class="text-muted-foreground italic"
            >Permission prompt no longer active</span
          >
        {/if}
      {:else if permission?.resolved}
        <span class="text-muted-foreground"
          >{outcome_line(
            permission.resolved.outcome,
            permission.resolved.auto,
          )}</span
        >
      {/if}
      {#each content as block, index (index)}
        {#if block.kind === "diff"}
          <InlineDiff
            path={block.path}
            old_text={block.old_text}
            new_text={block.new_text}
          />
        {:else if event.kind === "execute"}
          <TerminalBlock text={block.text} />
        {:else}
          <pre
            class="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/50 px-2 py-1 font-mono text-[11px]">{block.text}</pre>
        {/if}
      {/each}
      <!-- result_summary is the first text block's head; showing it beside
           full content would say the same thing twice. -->
      {#if content.length === 0 && event.result_summary}
        <pre
          class="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/50 px-2 py-1 font-mono text-[11px]">{event.result_summary}</pre>
      {/if}
      {#if chips.length > 0}
        <div class="flex flex-wrap gap-1">
          {#each chips as chip, index (index)}
            <button
              type="button"
              class="rounded bg-muted/50 px-1 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onclick={() => on_open_path(chip.path)}
            >
              {chip.path}{chip.line != null ? `:${String(chip.line)}` : ""}
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
