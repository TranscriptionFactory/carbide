<script lang="ts">
  import type { Theme } from "$lib/shared/types/theme";
  import { is_color_value } from "$lib/shared/utils/theme_helpers";
  import { CATEGORIES } from "./css_token_categories";

  type Props = {
    theme: Theme;
    on_add_override: (token: string, value: string) => void;
    on_remove_override: (token: string) => void;
  };

  let { theme, on_add_override, on_remove_override }: Props = $props();
  let computed_values: Record<string, string> = $state({});
  let collapsed: Record<string, boolean> = $state(
    Object.fromEntries(CATEGORIES.map((c) => [c.label, true])),
  );
  let search = $state("");

  function read_computed() {
    const style = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const cat of CATEGORIES) {
      for (const token of cat.tokens) {
        next[token] = style.getPropertyValue(token).trim();
      }
    }
    computed_values = next;
  }

  $effect(() => {
    void theme;
    read_computed();
  });

  function toggle(label: string) {
    collapsed[label] = !collapsed[label];
  }

  const filtered_categories = $derived(
    search.trim()
      ? CATEGORIES.map((cat) => ({
          ...cat,
          tokens: cat.tokens.filter((t) =>
            t.toLowerCase().includes(search.toLowerCase()),
          ),
        })).filter((cat) => cat.tokens.length > 0)
      : CATEGORIES,
  );

  function is_overridden(token: string): boolean {
    return token in theme.token_overrides;
  }

  function handle_add(token: string) {
    const value = computed_values[token] ?? "";
    on_add_override(token, value);
  }
</script>

<div class="CssTokenReference">
  <input
    type="search"
    class="CssTokenReference__search"
    placeholder="Filter tokens…"
    bind:value={search}
  />

  <div class="CssTokenReference__list">
    {#each filtered_categories as cat (cat.label)}
      {@const is_open = search.trim() ? true : !collapsed[cat.label]}
      <div class="CssTokenReference__category">
        <button
          type="button"
          class="CssTokenReference__category-header"
          onclick={() => toggle(cat.label)}
        >
          <span class="CssTokenReference__category-label">{cat.label}</span>
          <span class="CssTokenReference__category-count"
            >{cat.tokens.length}</span
          >
          <span class="CssTokenReference__chevron">{is_open ? "▲" : "▼"}</span>
        </button>

        {#if is_open}
          <div class="CssTokenReference__rows">
            {#each cat.tokens as token (token)}
              {@const overridden = is_overridden(token)}
              {@const display_value = overridden
                ? theme.token_overrides[token]
                : (computed_values[token] ?? "")}
              <div
                class="CssTokenReference__row"
                class:CssTokenReference__row--overridden={overridden}
              >
                <div class="CssTokenReference__token-col">
                  {#if is_color_value(display_value)}
                    <span
                      class="CssTokenReference__swatch"
                      style="background: {display_value};"
                    ></span>
                  {/if}
                  <span class="CssTokenReference__token-name">{token}</span>
                </div>
                <div class="CssTokenReference__value-col">
                  {#if overridden}
                    <input
                      type="text"
                      class="CssTokenReference__input"
                      value={theme.token_overrides[token]}
                      oninput={(e) =>
                        on_add_override(
                          token,
                          (e.target as HTMLInputElement).value,
                        )}
                    />
                    <button
                      type="button"
                      class="CssTokenReference__revert-btn"
                      title="Revert to default"
                      onclick={() => on_remove_override(token)}
                    >
                      &times;
                    </button>
                  {:else}
                    <span class="CssTokenReference__value" title={display_value}
                      >{display_value}</span
                    >
                    <button
                      type="button"
                      class="CssTokenReference__add-btn"
                      title="Override this token"
                      onclick={() => handle_add(token)}
                    >
                      +
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .CssTokenReference {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 0;
  }

  .CssTokenReference__search {
    width: 100%;
    font-family: var(--font-family-mono, ui-monospace, monospace);
    font-size: var(--text-xs);
    color: var(--foreground);
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.25rem);
    padding: var(--space-1) var(--space-2);
  }

  .CssTokenReference__search:focus {
    outline: 1px solid var(--ring);
    outline-offset: 0;
  }

  .CssTokenReference__list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.25rem);
    max-height: 400px;
    overflow-y: auto;
  }

  .CssTokenReference__category {
    border-bottom: 1px solid var(--border);
  }

  .CssTokenReference__category:last-child {
    border-bottom: none;
  }

  .CssTokenReference__category-header {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    width: 100%;
    padding: var(--space-1-5) var(--space-3);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--foreground);
    background: color-mix(in oklch, var(--muted) 60%, transparent);
    border: none;
    text-align: left;
    transition: background 80ms ease;
  }

  .CssTokenReference__category-header:hover {
    background: var(--muted);
  }

  .CssTokenReference__category-label {
    flex: 1;
  }

  .CssTokenReference__category-count {
    font-size: calc(var(--text-xs) * 0.9);
    color: var(--muted-foreground);
    font-family: var(--font-family-mono, ui-monospace, monospace);
  }

  .CssTokenReference__chevron {
    font-size: 0.6em;
    color: var(--muted-foreground);
  }

  .CssTokenReference__rows {
    display: flex;
    flex-direction: column;
  }

  .CssTokenReference__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    min-height: 1.75rem;
    transition: background 60ms ease;
  }

  .CssTokenReference__row:last-child {
    border-bottom: none;
  }

  .CssTokenReference__row:hover {
    background: var(--muted);
  }

  .CssTokenReference__row--overridden {
    background: color-mix(in oklch, var(--primary) 8%, transparent);
  }

  .CssTokenReference__row--overridden:hover {
    background: color-mix(in oklch, var(--primary) 12%, transparent);
  }

  .CssTokenReference__token-col {
    flex: 0 0 auto;
    width: 55%;
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    min-width: 0;
  }

  .CssTokenReference__swatch {
    display: inline-block;
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--border);
  }

  .CssTokenReference__token-name {
    font-family: var(--font-family-mono, ui-monospace, monospace);
    font-size: var(--text-xs);
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .CssTokenReference__value-col {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    min-width: 0;
  }

  .CssTokenReference__value {
    font-family: var(--font-family-mono, ui-monospace, monospace);
    font-size: calc(var(--text-xs) * 0.9);
    color: var(--muted-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .CssTokenReference__input {
    font-family: var(--font-family-mono, ui-monospace, monospace);
    font-size: calc(var(--text-xs) * 0.9);
    color: var(--foreground);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius-sm, 0.25rem) * 0.75);
    padding: 1px var(--space-1-5);
    min-width: 0;
    flex: 1;
  }

  .CssTokenReference__input:focus {
    outline: 1px solid var(--ring);
    outline-offset: 0;
    background: color-mix(in oklch, var(--background) 80%, transparent);
  }

  .CssTokenReference__revert-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    font-size: var(--text-sm);
    line-height: 1;
    color: var(--muted-foreground);
    background: transparent;
    border: 1px solid transparent;
    border-radius: calc(var(--radius-sm, 0.25rem) * 0.75);
    padding: 0;
    transition: all 80ms ease;
  }

  .CssTokenReference__revert-btn:hover {
    color: var(--destructive, var(--foreground));
    border-color: var(--border);
    background: color-mix(in oklch, var(--muted) 60%, transparent);
  }

  .CssTokenReference__add-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    font-size: var(--text-sm);
    line-height: 1;
    color: var(--muted-foreground);
    background: transparent;
    border: 1px solid transparent;
    border-radius: calc(var(--radius-sm, 0.25rem) * 0.75);
    padding: 0;
    transition: all 80ms ease;
  }

  .CssTokenReference__add-btn:hover {
    color: var(--foreground);
    background: color-mix(in oklch, var(--muted) 60%, transparent);
    border-color: var(--border);
  }
</style>
