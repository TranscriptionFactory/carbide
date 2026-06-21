<script lang="ts">
  import { onMount } from "svelte";

  type ComboItem = {
    value: string;
    hint?: string;
    description?: string | null;
    indices?: number[];
  };

  type Props = {
    value: string;
    items: ComboItem[];
    placeholder?: string;
    autofocus?: boolean;
    on_input: (text: string) => void;
    on_select: (value: string) => void;
    on_enter?: () => void;
    on_escape?: () => void;
  };

  let {
    value,
    items,
    placeholder = "",
    autofocus = false,
    on_input,
    on_select,
    on_enter,
    on_escape,
  }: Props = $props();

  let open = $state(false);
  let selected_index = $state(-1);
  let input_el: HTMLInputElement | undefined;

  const show_dropdown = $derived(open && items.length > 0);

  onMount(() => {
    if (autofocus) input_el?.focus();
  });

  function select(item_value: string) {
    on_select(item_value);
    open = false;
    selected_index = -1;
  }

  function handle_input(e: Event) {
    on_input((e.currentTarget as HTMLInputElement).value);
    open = true;
    selected_index = -1;
  }

  function handle_keydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      open = true;
      selected_index = Math.min(selected_index + 1, items.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selected_index = Math.max(selected_index - 1, -1);
    } else if (e.key === "Enter") {
      const choice = show_dropdown ? items[selected_index] : undefined;
      if (choice) {
        e.preventDefault();
        select(choice.value);
      } else {
        on_enter?.();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (open) open = false;
      else on_escape?.();
    } else if (e.key === "Tab") {
      open = false;
    }
  }

  function highlight(text: string, indices: number[] | undefined) {
    const marked = new Set(indices ?? []);
    return text.split("").map((ch, i) => ({ ch, match: marked.has(i) }));
  }
</script>

<div class="PropertyCombobox">
  <input
    bind:this={input_el}
    class="PropertyCombobox__input"
    type="text"
    {value}
    {placeholder}
    oninput={handle_input}
    onkeydown={handle_keydown}
    onfocus={() => (open = true)}
    onblur={() => setTimeout(() => (open = false), 150)}
  />
  {#if show_dropdown}
    <div class="PropertyCombobox__dropdown">
      {#each items as item, i (item.value)}
        <button
          type="button"
          class="PropertyCombobox__item"
          class:PropertyCombobox__item--selected={i === selected_index}
          onmousedown={(e) => {
            e.preventDefault();
            select(item.value);
          }}
        >
          <span class="PropertyCombobox__item-main">
            <span class="PropertyCombobox__item-value">
              {#each highlight(item.value, item.indices) as part}
                {#if part.match}
                  <span class="PropertyCombobox__match">{part.ch}</span>
                {:else}{part.ch}{/if}
              {/each}
            </span>
            {#if item.hint}
              <span class="PropertyCombobox__item-hint">{item.hint}</span>
            {/if}
          </span>
          {#if item.description}
            <span class="PropertyCombobox__item-desc">{item.description}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .PropertyCombobox {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .PropertyCombobox__input {
    width: 100%;
    min-width: 0;
    padding: var(--space-0-5) var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--background);
    color: var(--foreground);
    font-size: var(--text-xs);
  }

  .PropertyCombobox__input:focus {
    outline: none;
    border-color: var(--ring);
  }

  .PropertyCombobox__dropdown {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    z-index: 50;
    max-height: calc(8 * 2rem);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    background: var(--popover);
    color: var(--popover-foreground);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
  }

  .PropertyCombobox__item {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--space-1) var(--space-2);
  }

  .PropertyCombobox__item:hover,
  .PropertyCombobox__item--selected {
    background: var(--accent);
    color: var(--accent-foreground);
  }

  .PropertyCombobox__item-main {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .PropertyCombobox__item-value {
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .PropertyCombobox__match {
    font-weight: 700;
    color: var(--primary);
  }

  .PropertyCombobox__item-hint {
    flex-shrink: 0;
    font-size: var(--text-2xs, 0.625rem);
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .PropertyCombobox__item-desc {
    font-size: var(--text-2xs, 0.625rem);
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
