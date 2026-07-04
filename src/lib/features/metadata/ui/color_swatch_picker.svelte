<script lang="ts">
  import {
    NAMED_COLOR_OPTIONS,
    sanitize_note_color,
  } from "$lib/features/folder";

  type Props = {
    value?: string | null;
    on_select: (color: string) => void;
  };

  let { value = null, on_select }: Props = $props();

  let hex_input = $state("");
  const hex_valid = $derived(sanitize_note_color(hex_input) !== null);

  function commit_hex() {
    const sanitized = sanitize_note_color(hex_input);
    if (!sanitized) return;
    on_select(sanitized);
    hex_input = "";
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex flex-wrap gap-1" role="listbox" aria-label="Color">
    {#each NAMED_COLOR_OPTIONS as color (color)}
      <button
        type="button"
        role="option"
        aria-selected={value === color}
        class="size-5 rounded-full border border-border transition-transform hover:scale-110 aria-selected:ring-2 aria-selected:ring-ring"
        style="background-color: {color};"
        title={color}
        onclick={() => on_select(color)}
      ></button>
    {/each}
  </div>
  <div class="flex items-center gap-1">
    <input
      class="h-7 w-full rounded border border-input bg-background px-2 text-xs"
      type="text"
      placeholder="#hex"
      bind:value={hex_input}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit_hex();
        }
      }}
    />
    <button
      type="button"
      class="h-7 rounded border border-border px-2 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
      disabled={!hex_valid}
      onclick={commit_hex}
    >
      Apply
    </button>
  </div>
</div>
