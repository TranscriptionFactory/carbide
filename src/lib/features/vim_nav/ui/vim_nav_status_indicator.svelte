<script lang="ts">
  import type { NavContext } from "$lib/features/vim_nav";

  interface Props {
    active_context: NavContext;
    pending_keys: string;
    on_click: () => void;
  }

  let { active_context, pending_keys, on_click }: Props = $props();

  const CONTEXT_LABELS: Record<
    Exclude<NavContext, "none" | "omnibar">,
    string
  > = {
    file_tree: "EXPLORER",
    tab_bar: "TABS",
    outline: "OUTLINE",
  };

  const label = $derived(
    active_context !== "none" && active_context !== "omnibar"
      ? CONTEXT_LABELS[active_context]
      : null,
  );
</script>

{#if label}
  <button
    type="button"
    class="VimNavIndicator"
    onclick={on_click}
    aria-label="Vim navigation active — press ? for shortcuts"
  >
    <span class="VimNavIndicator__mode">VIM</span>
    <span class="VimNavIndicator__context">{label}</span>
    {#if pending_keys}
      <span class="VimNavIndicator__keys">{pending_keys}</span>
    {/if}
  </button>
{/if}

<style>
  .VimNavIndicator {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-1-5);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .VimNavIndicator:hover {
    opacity: 0.8;
  }

  .VimNavIndicator__mode {
    font-weight: 600;
    color: var(--primary);
  }

  .VimNavIndicator__context {
    color: var(--muted-foreground);
    font-weight: 500;
    letter-spacing: 0.03em;
  }

  .VimNavIndicator__keys {
    font-family: var(--font-mono, monospace);
    font-weight: 600;
    color: var(--warning, var(--primary));
    min-width: 1ch;
  }
</style>
