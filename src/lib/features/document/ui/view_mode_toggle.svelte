<script lang="ts" generics="T extends string">
  import type { Component } from "svelte";

  type ViewModeOption = {
    value: T;
    label: string;
    icon: Component;
    title?: string;
  };

  interface Props {
    aria_label: string;
    options: readonly ViewModeOption[];
    value: T;
    on_select: (value: T) => void;
  }

  let { aria_label, options, value, on_select }: Props = $props();
</script>

<div class="ViewModeToggle">
  <div class="ViewModeToggle__group" role="radiogroup" aria-label={aria_label}>
    {#each options as option (option.value)}
      <button
        type="button"
        class="ViewModeToggle__btn"
        class:ViewModeToggle__btn--active={value === option.value}
        role="radio"
        aria-checked={value === option.value}
        title={option.title}
        onclick={() => {
          if (value !== option.value) on_select(option.value);
        }}
      >
        <option.icon />
        <span>{option.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .ViewModeToggle {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .ViewModeToggle__group {
    display: inline-flex;
    align-items: center;
    gap: var(--space-0-5, 2px);
    padding: 2px;
    background-color: var(--muted);
    border-radius: var(--radius-sm);
  }

  .ViewModeToggle__btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    background-color: transparent;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .ViewModeToggle__btn:hover {
    color: var(--foreground);
  }

  .ViewModeToggle__btn--active {
    background-color: var(--background);
    color: var(--foreground);
  }

  :global(.ViewModeToggle__btn svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }
</style>
