<script lang="ts">
  import { search } from "node-emoji";
  import { sanitize_note_icon } from "$lib/features/folder";

  type Props = {
    value?: string | null;
    on_select: (icon: string) => void;
  };

  let { value = null, on_select }: Props = $props();

  let query = $state("");
  const suggestions = $derived(
    query.trim() ? search(query.trim()).slice(0, 12) : [],
  );
  const direct_glyph = $derived(sanitize_note_icon(query));

  function commit(icon: string) {
    const sanitized = sanitize_note_icon(icon);
    if (!sanitized) return;
    on_select(sanitized);
    query = "";
  }
</script>

<div class="flex flex-col gap-2">
  <input
    class="h-7 w-full rounded border border-input bg-background px-2 text-xs"
    type="text"
    placeholder="Emoji name or glyph"
    bind:value={query}
    onkeydown={(e) => {
      if (e.key === "Enter" && direct_glyph) {
        e.preventDefault();
        commit(direct_glyph);
      }
    }}
  />
  {#if suggestions.length > 0}
    <div class="flex flex-wrap gap-1" role="listbox" aria-label="Icon">
      {#each suggestions as suggestion (suggestion.name)}
        <button
          type="button"
          role="option"
          aria-selected={value === suggestion.emoji}
          class="size-7 rounded border border-transparent text-base hover:bg-muted aria-selected:border-ring"
          title={suggestion.name}
          onclick={() => commit(suggestion.emoji)}
        >
          {suggestion.emoji}
        </button>
      {/each}
    </div>
  {:else if direct_glyph && direct_glyph !== value}
    <button
      type="button"
      class="h-7 self-start rounded border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
      onclick={() => commit(direct_glyph)}
    >
      Use {direct_glyph}
    </button>
  {/if}
</div>
