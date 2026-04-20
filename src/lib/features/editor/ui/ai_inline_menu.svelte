<script lang="ts">
  import { ArrowUp, Check, X, RotateCcw, Loader2 } from "@lucide/svelte";
  import type { AiMenuMode } from "../adapters/ai_menu_plugin";

  interface Props {
    mode: AiMenuMode;
    streaming: boolean;
    on_submit: (prompt: string) => void;
    on_command: (command_id: string) => void;
    on_accept: () => void;
    on_reject: () => void;
    on_close: () => void;
  }

  let {
    mode,
    streaming,
    on_submit,
    on_command,
    on_accept,
    on_reject,
    on_close,
  }: Props = $props();

  let prompt_text = $state("");

  type CommandItem = { id: string; label: string; description: string };

  const cursor_commands: CommandItem[] = [
    {
      id: "continue",
      label: "Continue writing",
      description: "Extend from cursor",
    },
    { id: "summarize", label: "Summarize", description: "Summarize the note" },
    {
      id: "expand",
      label: "Expand",
      description: "Elaborate on surrounding text",
    },
  ];

  const selection_commands: CommandItem[] = [
    {
      id: "improve",
      label: "Improve writing",
      description: "Improve clarity and style",
    },
    {
      id: "simplify",
      label: "Simplify",
      description: "Make simpler and shorter",
    },
    {
      id: "fix_grammar",
      label: "Fix grammar",
      description: "Fix spelling and grammar",
    },
    {
      id: "translate",
      label: "Translate",
      description: "Translate to another language",
    },
  ];

  let commands = $derived(
    mode === "selection_command" ? selection_commands : cursor_commands,
  );

  function handle_keydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
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

<div class="AiInlineMenu" role="dialog" aria-label="AI inline menu">
  {#if streaming}
    <div class="AiInlineMenu__streaming">
      <Loader2 size={14} class="AiInlineMenu__spinner" />
      <span class="AiInlineMenu__streaming-text">Writing…</span>
    </div>
  {:else if mode === "cursor_suggestion"}
    <div class="AiInlineMenu__suggestion">
      <button
        type="button"
        class="AiInlineMenu__action-btn AiInlineMenu__action-btn--accept"
        onclick={on_accept}
      >
        <Check size={14} />
        <span>Accept</span>
      </button>
      <button
        type="button"
        class="AiInlineMenu__action-btn AiInlineMenu__action-btn--reject"
        onclick={on_reject}
      >
        <X size={14} />
        <span>Discard</span>
      </button>
      <button
        type="button"
        class="AiInlineMenu__action-btn"
        onclick={() => on_command("retry")}
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
        bind:value={prompt_text}
        onkeydown={handle_keydown}
        rows={1}
      ></textarea>
      <button
        type="button"
        class="AiInlineMenu__submit"
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
      {#each commands as cmd (cmd.id)}
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
  {/if}
</div>
