<script lang="ts">
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import { is_mac } from "$lib/features/window";

  type Props = {
    ask_mode: boolean;
    on_mode_change: (ask_mode: boolean) => void;
  };

  let { ask_mode, on_mode_change }: Props = $props();

  const MOD_LABEL = is_mac() ? "⌘" : "Ctrl+";
</script>

<div
  class="OmnibarModeSegment"
  role="group"
  aria-label="Omnibar mode"
  title="Switch Search / Ask ({MOD_LABEL}/)"
>
  <button
    type="button"
    class="OmnibarModeSegment__option"
    class:OmnibarModeSegment__option--on={!ask_mode}
    aria-pressed={!ask_mode}
    onclick={() => on_mode_change(false)}
  >
    Search
  </button>
  <button
    type="button"
    class="OmnibarModeSegment__option"
    class:OmnibarModeSegment__option--on={ask_mode}
    aria-pressed={ask_mode}
    data-testid="omnibar-ask-toggle"
    onclick={() => on_mode_change(true)}
  >
    <SparklesIcon />
    Ask
  </button>
  <span class="OmnibarModeSegment__hint" aria-hidden="true">{MOD_LABEL}/</span>
</div>

<style>
  .OmnibarModeSegment {
    display: flex;
    flex-shrink: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .OmnibarModeSegment__option {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-0-5) var(--space-2);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .OmnibarModeSegment__option:hover {
    background-color: var(--muted);
  }

  .OmnibarModeSegment__option--on {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  .OmnibarModeSegment__hint {
    display: inline-flex;
    align-items: center;
    padding: var(--space-0-5) var(--space-1-5);
    border-left: 1px solid var(--border);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  :global(.OmnibarModeSegment__option svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }
</style>
