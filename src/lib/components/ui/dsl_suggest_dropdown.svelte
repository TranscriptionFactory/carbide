<script lang="ts">
  import type { DslSuggestion } from "$lib/shared/types/dsl_suggestion";

  type Props = {
    items: DslSuggestion[];
    selected_index: number;
    on_select: (i: number) => void;
  };

  let { items, selected_index, on_select }: Props = $props();
</script>

<div class="DslSuggest__dropdown">
  {#each items as item, i (item.label)}
    <button
      class="DslSuggest__item"
      class:DslSuggest__item--selected={i === selected_index}
      type="button"
      onmousedown={(e) => {
        e.preventDefault();
        on_select(i);
      }}
    >
      <span class="DslSuggest__label">{item.label}</span>
      {#if item.detail}
        <span class="DslSuggest__detail">{item.detail}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .DslSuggest__dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--popover);
    color: var(--popover-foreground);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
    box-shadow:
      0 4px 6px -1px rgb(0 0 0 / 0.1),
      0 2px 4px -2px rgb(0 0 0 / 0.1);
    max-height: calc(10 * 2.25rem);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .DslSuggest__item {
    all: unset;
    cursor: pointer; /* all:unset beats the global :where() cursor rule */
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    line-height: 1.5rem;
    white-space: nowrap;
    overflow: hidden;
    border-radius: 0;
  }

  .DslSuggest__item:hover {
    background: var(--accent);
    color: var(--accent-foreground);
  }

  .DslSuggest__item--selected {
    background: var(--accent);
    color: var(--accent-foreground);
  }

  .DslSuggest__label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .DslSuggest__detail {
    margin-left: auto;
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }
</style>
