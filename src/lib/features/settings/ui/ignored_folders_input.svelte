<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import * as Popover from "$lib/components/ui/popover";
  import FolderIcon from "@lucide/svelte/icons/folder";

  type Props = {
    value: string[];
    folder_paths: string[];
    on_change: (value: string[]) => void;
  };

  let { value, folder_paths, on_change }: Props = $props();

  let textarea_ref = $state<HTMLTextAreaElement | null>(null);
  let open = $state(false);
  let query = $state("");
  let selected_index = $state(0);
  let cursor_pos = $state({ top: 0, left: 0 });

  const raw_text = $derived(value.join("\n"));

  const suggestions = $derived.by(() => {
    if (!query) return [];
    const lower_query = query.toLowerCase();
    return folder_paths
      .filter((p) => p.toLowerCase().includes(lower_query))
      .slice(0, 10);
  });

  function get_cursor_xy(textarea: HTMLTextAreaElement) {
    const { selectionStart } = textarea;
    const text_before = textarea.value.substring(0, selectionStart);
    const lines = text_before.split("\n");
    const current_line_num = lines.length;
    const current_line_text = lines[lines.length - 1] ?? "";

    // This is a very rough approximation.
    // For a real implementation, we'd use a ghost element,
    // but for now let's try to anchor it to the bottom of the line.
    const line_height = 20; // approximate
    const char_width = 8; // approximate

    const top = current_line_num * line_height;
    const left = current_line_text.length * char_width;

    return { top, left };
  }

  function handle_input(e: Event & { currentTarget: HTMLTextAreaElement }) {
    const textarea = e.currentTarget;
    const text = textarea.value;
    const lines = text.split("\n");
    on_change(lines.map((l) => l.trim()).filter((l) => l));

    const { selectionStart } = textarea;
    const text_before = text.substring(0, selectionStart);
    const last_line = text_before.split("\n").pop() || "";

    if (last_line.trim().length > 0) {
      query = last_line.trim();
      open = suggestions.length > 0;
      selected_index = 0;
      cursor_pos = get_cursor_xy(textarea);
    } else {
      open = false;
      query = "";
    }
  }

  function handle_keydown(e: KeyboardEvent) {
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selected_index = (selected_index + 1) % suggestions.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selected_index =
        (selected_index - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      accept_suggestion(selected_index);
    } else if (e.key === "Escape") {
      open = false;
    }
  }

  function accept_suggestion(index: number) {
    const suggestion = suggestions[index];
    if (!suggestion || !textarea_ref) return;

    const textarea = textarea_ref;
    const text = textarea.value;
    const { selectionStart } = textarea;
    const text_before = text.substring(0, selectionStart);
    const text_after = text.substring(selectionStart);

    const lines_before = text_before.split("\n");
    lines_before[lines_before.length - 1] = suggestion;

    const new_text = lines_before.join("\n") + text_after;
    const new_lines = new_text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);

    on_change(new_lines);
    open = false;
    query = "";

    // Focus back and set cursor
    setTimeout(() => {
      if (textarea_ref) {
        textarea_ref.focus();
        const new_cursor_pos = lines_before.join("\n").length;
        textarea_ref.setSelectionRange(new_cursor_pos, new_cursor_pos);
      }
    }, 0);
  }
</script>

<div class="relative w-full">
  <textarea
    bind:this={textarea_ref}
    class="SettingsDialog__textarea w-full"
    value={raw_text}
    oninput={handle_input}
    onkeydown={handle_keydown}
    rows="4"
    placeholder={`node_modules\nbuild\npapers/raw`}
  ></textarea>

  {#if open && suggestions.length > 0}
    <div
      class="absolute z-50 w-64 bg-popover text-popover-foreground border rounded-md shadow-md p-1"
      style="top: {cursor_pos.top + 24}px; left: {Math.min(
        cursor_pos.left,
        200,
      )}px"
    >
      {#each suggestions as suggestion, i}
        <button
          type="button"
          class="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded-sm hover:bg-accent hover:text-accent-foreground"
          class:bg-accent={i === selected_index}
          class:text-accent-foreground={i === selected_index}
          onclick={() => accept_suggestion(i)}
        >
          <FolderIcon class="w-4 h-4 text-muted-foreground" />
          <span class="truncate">{suggestion}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .SettingsDialog__textarea {
    display: block;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.5;
    background-color: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    resize: vertical;
    transition:
      border-color var(--duration-fast) var(--ease-default),
      box-shadow var(--duration-fast) var(--ease-default);
  }

  .SettingsDialog__textarea:focus {
    outline: none;
    border-color: var(--interactive);
    box-shadow: 0 0 0 2px var(--interactive-bg);
  }
</style>
