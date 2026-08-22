<script lang="ts">
  import {
    ArrowUp,
    Check,
    X,
    RotateCcw,
    Loader2,
    Settings,
  } from "@lucide/svelte";
  import type { AiMenuMode } from "../adapters/ai_menu_plugin";
  import type { InstructionRecipe } from "$lib/shared/types/prompt_recipe";
  import { contain_focus } from "$lib/components/ui/contain_focus";
  import { is_plain_enter } from "$lib/shared/utils/keyboard";
  import {
    AssistantPresence,
    AssistantStopButton,
    type RunId,
    type RunRecord,
  } from "$lib/features/assistant";
  import type { EditorView } from "prosemirror-view";

  interface Props {
    view: EditorView;
    mode: AiMenuMode;
    streaming: boolean;
    commands: InstructionRecipe[];
    on_submit: (prompt: string) => void;
    on_command: (command_id: string) => void;
    on_retry: () => void;
    on_accept: () => void;
    on_reject: () => void;
    on_close: () => void;
    on_open_settings?: () => void;
    // The menu is imperatively mounted with static props, so runs arrive as a
    // getter: the read happens inside this component's reactive scope, which
    // keeps it live against the run store's SvelteMap.
    get_runs?: () => RunRecord[];
    on_stop?: (id: RunId) => void;
  }

  let {
    view,
    mode,
    streaming,
    commands,
    on_submit,
    on_command,
    on_retry,
    on_accept,
    on_reject,
    on_close,
    on_open_settings,
    get_runs,
    on_stop,
  }: Props = $props();

  let prompt_text = $state("");
  let textarea_el: HTMLTextAreaElement | undefined = $state();

  $effect(() => {
    if (textarea_el) textarea_el.focus();
  });

  let filtered_commands = $derived(
    mode === "selection_command"
      ? commands.filter((c) => c.use_selection)
      : commands.filter((c) => !c.use_selection),
  );

  const runs = $derived(get_runs?.() ?? []);
  // statement form: the vite ssr transform drops the parens in
  // `a && (b || c)`, which would let any streaming run pass the kind filter
  const inline_active_run = $derived.by(() => {
    let newest: RunRecord | null = null;
    for (const run of runs) {
      if (run.kind !== "inline") continue;
      if (run.status !== "starting" && run.status !== "streaming") continue;
      if (newest !== null && newest.started_at >= run.started_at) continue;
      newest = run;
    }
    return newest;
  });

  function handle_stop(id: RunId) {
    on_stop?.(id);
  }

  function handle_keydown(e: KeyboardEvent) {
    if (is_plain_enter(e)) {
      e.preventDefault();
      if (prompt_text.trim()) {
        on_submit(prompt_text.trim());
        prompt_text = "";
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      on_close();
    }
  }
</script>

<div
  class="AiInlineMenu"
  role="dialog"
  aria-label="AI inline menu"
  data-testid="ai-inline-menu"
  use:contain_focus={() => view.focus()}
>
  <div class="AiInlineMenu__header">
    <AssistantPresence {runs} on_stop={handle_stop} />
  </div>
  {#if streaming}
    <div class="AiInlineMenu__streaming">
      <Loader2 size={14} class="AiInlineMenu__spinner" />
      <span class="AiInlineMenu__streaming-text">Writing…</span>
      {#if inline_active_run && on_stop}
        <AssistantStopButton run={inline_active_run} {on_stop} />
      {/if}
    </div>
  {:else if mode === "cursor_suggestion"}
    <div class="AiInlineMenu__suggestion">
      <button
        type="button"
        class="AiInlineMenu__action-btn AiInlineMenu__action-btn--accept"
        onclick={on_accept}
        data-testid="ai-inline-accept"
      >
        <Check size={14} />
        <span>Accept</span>
      </button>
      <button
        type="button"
        class="AiInlineMenu__action-btn AiInlineMenu__action-btn--reject"
        onclick={on_reject}
        data-testid="ai-inline-reject"
      >
        <X size={14} />
        <span>Discard</span>
      </button>
      <button
        type="button"
        class="AiInlineMenu__action-btn"
        onclick={on_retry}
        data-testid="ai-inline-retry"
      >
        <RotateCcw size={14} />
        <span>Try again</span>
      </button>
    </div>
  {:else}
    <div class="AiInlineMenu__input-row">
      <textarea
        class="AiInlineMenu__textarea"
        placeholder="Ask AI to write…"
        bind:this={textarea_el}
        bind:value={prompt_text}
        onkeydown={handle_keydown}
        rows={1}
      ></textarea>
      <button
        type="button"
        class="AiInlineMenu__submit"
        data-testid="ai-inline-submit"
        disabled={!prompt_text.trim()}
        onclick={() => {
          if (prompt_text.trim()) {
            on_submit(prompt_text.trim());
            prompt_text = "";
          }
        }}
      >
        <ArrowUp size={14} />
      </button>
    </div>
    <div class="AiInlineMenu__commands">
      {#each filtered_commands as cmd (cmd.id)}
        <button
          type="button"
          class="AiInlineMenu__command"
          onclick={() => on_command(cmd.id)}
        >
          <span class="AiInlineMenu__command-label">{cmd.label}</span>
          <span class="AiInlineMenu__command-desc">{cmd.description}</span>
        </button>
      {/each}
    </div>
    {#if on_open_settings}
      <div class="AiInlineMenu__footer">
        <button
          type="button"
          class="AiInlineMenu__settings-btn"
          onclick={on_open_settings}
          title="Configure inline commands"
        >
          <Settings size={12} />
        </button>
      </div>
    {/if}
  {/if}
</div>
