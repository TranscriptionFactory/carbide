<script lang="ts">
  import type { Theme } from "$lib/shared/types/theme";
  import { is_color_value } from "$lib/shared/utils/theme_helpers";

  type Props = {
    theme: Theme;
    on_add_override: (token: string, value: string) => void;
  };

  let { theme, on_add_override }: Props = $props();

  type TokenCategory = {
    label: string;
    tokens: string[];
  };

  const CATEGORIES: TokenCategory[] = [
    {
      label: "Colors",
      tokens: [
        "--background",
        "--foreground",
        "--card",
        "--card-foreground",
        "--popover",
        "--popover-foreground",
        "--secondary",
        "--secondary-foreground",
        "--muted",
        "--muted-foreground",
        "--border",
        "--input",
        "--primary",
        "--primary-foreground",
        "--accent",
        "--accent-foreground",
        "--destructive",
      ],
    },
    {
      label: "Accent Scale",
      tokens: [
        "--teal-50",
        "--teal-100",
        "--teal-200",
        "--teal-300",
        "--teal-400",
        "--teal-500",
        "--teal-600",
        "--teal-700",
        "--teal-800",
        "--teal-900",
      ],
    },
    {
      label: "Interactive",
      tokens: [
        "--interactive",
        "--interactive-hover",
        "--interactive-muted",
        "--interactive-bg",
        "--interactive-bg-hover",
        "--interactive-border",
        "--interactive-border-subtle",
        "--interactive-border-strong",
        "--interactive-text-on-bg",
        "--interactive-text-subtle",
        "--interactive-disabled",
        "--interactive-disabled-bg",
      ],
    },
    {
      label: "Surfaces",
      tokens: [
        "--background-surface-2",
        "--background-surface-3",
        "--foreground-tertiary",
        "--border-strong",
        "--border-subtle",
        "--accent-hover",
      ],
    },
    {
      label: "Focus & Selection",
      tokens: [
        "--focus-ring",
        "--focus-ring-offset",
        "--selection-bg",
        "--ring",
      ],
    },
    {
      label: "Sidebar",
      tokens: [
        "--sidebar",
        "--sidebar-foreground",
        "--sidebar-primary",
        "--sidebar-primary-foreground",
        "--sidebar-accent",
        "--sidebar-accent-foreground",
        "--sidebar-border",
        "--sidebar-ring",
      ],
    },
    {
      label: "Shadows",
      tokens: [
        "--shadow-xs",
        "--shadow-sm",
        "--shadow-md",
        "--shadow-lg",
        "--shadow-color",
      ],
    },
    {
      label: "Spacing",
      tokens: [
        "--space-0",
        "--space-0-5",
        "--space-1",
        "--space-1-5",
        "--space-2",
        "--space-2-5",
        "--space-3",
        "--space-4",
        "--space-5",
        "--space-6",
        "--space-8",
        "--space-10",
        "--space-12",
      ],
    },
    {
      label: "Typography",
      tokens: [
        "--text-xs",
        "--text-sm",
        "--text-base",
        "--text-md",
        "--text-lg",
        "--font-family-sans",
        "--font-family-mono",
      ],
    },
    {
      label: "Sizes",
      tokens: [
        "--size-icon-xs",
        "--size-icon-sm",
        "--size-icon-md",
        "--size-icon-lg",
        "--size-touch-xs",
        "--size-touch-sm",
        "--size-touch-md",
        "--size-touch-lg",
        "--size-activity-bar",
        "--size-status-bar",
        "--size-tree-row",
        "--size-dialog-sm",
        "--size-dialog-md",
        "--size-dialog-lg",
        "--size-dialog-xl",
      ],
    },
    {
      label: "Editor",
      tokens: [
        "--editor-heading-1",
        "--editor-heading-2",
        "--editor-heading-3",
        "--editor-heading-4",
        "--editor-heading-5",
        "--editor-heading-6",
        "--editor-bullet-size",
        "--editor-checkbox-size",
        "--editor-font-size",
        "--editor-line-height",
        "--editor-spacing",
        "--editor-heading-color",
        "--editor-heading-weight",
        "--editor-text",
        "--editor-bold-color",
        "--editor-italic-color",
        "--editor-link",
        "--editor-blockquote-border",
        "--editor-blockquote-text",
        "--editor-code-bg",
        "--editor-code-block-text",
        "--editor-code-inline-bg",
        "--editor-code-inline-text",
        "--editor-mark-bg",
        "--editor-mark-text",
      ],
    },
    {
      label: "Scrollbar",
      tokens: [
        "--scrollbar-width",
        "--scrollbar-thumb",
        "--scrollbar-thumb-hover",
      ],
    },
    {
      label: "Transitions",
      tokens: [
        "--duration-fast",
        "--duration-normal",
        "--duration-slow",
        "--duration-slower",
      ],
    },
    {
      label: "Borders",
      tokens: ["--radius", "--border-width-default", "--border-width-thick"],
    },
    {
      label: "Z-Index",
      tokens: [
        "--z-base",
        "--z-dropdown",
        "--z-sticky",
        "--z-overlay",
        "--z-modal",
        "--z-popover",
        "--z-tooltip",
      ],
    },
    {
      label: "Warning",
      tokens: [
        "--warning",
        "--warning-bg",
        "--warning-text-on-bg",
        "--warning-border",
      ],
    },
    {
      label: "Status",
      tokens: ["--indicator-dirty", "--indicator-clean"],
    },
  ];

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
              {@const value = computed_values[token] ?? ""}
              {@const overridden = is_overridden(token)}
              <div
                class="CssTokenReference__row"
                class:CssTokenReference__row--overridden={overridden}
              >
                <div class="CssTokenReference__token-col">
                  {#if is_color_value(value)}
                    <span
                      class="CssTokenReference__swatch"
                      style="background: {value};"
                    ></span>
                  {/if}
                  <span class="CssTokenReference__token-name">{token}</span>
                </div>
                <div class="CssTokenReference__value-col">
                  <span class="CssTokenReference__value" title={value}
                    >{value}</span
                  >
                  {#if overridden}
                    <span class="CssTokenReference__badge">overridden</span>
                  {:else}
                    <button
                      type="button"
                      class="CssTokenReference__add-btn"
                      title="Add to token_overrides"
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
    cursor: pointer;
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

  .CssTokenReference__badge {
    flex-shrink: 0;
    font-size: calc(var(--text-xs) * 0.85);
    font-family: var(--font-family-sans, inherit);
    color: var(--primary-foreground);
    background: var(--primary);
    border-radius: calc(var(--radius-sm, 0.25rem) * 0.75);
    padding: 0 var(--space-1);
    line-height: 1.4;
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
    cursor: pointer;
    padding: 0;
    transition: all 80ms ease;
  }

  .CssTokenReference__add-btn:hover {
    color: var(--foreground);
    background: color-mix(in oklch, var(--muted) 60%, transparent);
    border-color: var(--border);
  }
</style>
