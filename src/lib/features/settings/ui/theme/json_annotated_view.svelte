<script lang="ts">
  import type { Theme } from "$lib/shared/types/theme";
  import { is_color_value } from "$lib/shared/utils/theme_helpers";

  type Props = {
    theme: Theme;
    on_update: (theme: Theme) => void;
  };

  let { theme, on_update }: Props = $props();

  const FIELD_DESCRIPTIONS: Record<string, string> = {
    id: "Unique identifier",
    name: "Display name",
    color_scheme: "Light or dark base",
    is_builtin: "Built-in theme flag",
    accent_hue: "Accent hue (0–360)",
    accent_chroma: "Accent saturation",
    font_family_sans: "Body text font",
    font_family_mono: "Monospace font",
    font_size: "Base size multiplier",
    line_height: "Line height multiplier",
    spacing: "UI density preset",
    heading_color: "Heading color mode",
    heading_font_weight: "Heading weight (100–900)",
    bold_style: "Bold text rendering",
    blockquote_style: "Blockquote appearance",
    code_block_style: "Code block appearance",
    editor_text_color: "Body text color",
    bold_color: "Bold text color",
    italic_color: "Italic text color",
    link_color: "Link color",
    blockquote_border_color: "Blockquote border",
    blockquote_text_color: "Blockquote text",
    code_block_bg: "Code block background",
    code_block_text_color: "Code block text",
    inline_code_bg: "Inline code background",
    inline_code_text_color: "Inline code text",
    highlight_bg: "Highlight background",
    highlight_text_color: "Highlight text",
    graph_node_color: "Graph node color",
    graph_node_primary_color: "Graph node primary color",
    graph_edge_color: "Graph edge color",
    graph_edge_semantic_color: "Graph edge semantic color",
    graph_label_color: "Graph label color",
    token_overrides: "CSS variable overrides",
    auto_palette: "Auto-generate from accent",
  };

  const READ_ONLY_FIELDS = new Set(["id", "is_builtin"]);

  const COLLAPSE_THRESHOLD = 5;

  const initial_expanded = $derived(
    Object.keys(theme.token_overrides).length > 0,
  );
  let token_overrides_user_toggled: boolean | null = $state(null);
  const token_overrides_expanded = $derived(
    token_overrides_user_toggled !== null
      ? token_overrides_user_toggled
      : initial_expanded,
  );

  const theme_entries = $derived(
    Object.entries(theme as Record<string, unknown>).filter(
      ([key]) => key !== "token_overrides",
    ),
  );

  const override_entries = $derived(Object.entries(theme.token_overrides));

  function update_field(key: string, value: unknown) {
    on_update({ ...theme, [key]: value } as Theme);
  }

  function update_override(token: string, value: string) {
    if (value.trim() === "") {
      remove_override(token);
      return;
    }
    on_update({
      ...theme,
      token_overrides: { ...theme.token_overrides, [token]: value },
    });
  }

  function remove_override(token: string) {
    const { [token]: _, ...rest } = theme.token_overrides;
    on_update({ ...theme, token_overrides: rest });
  }
</script>

<div class="JsonAnnotatedView">
  {#each theme_entries as [key, value]}
    <div class="JsonAnnotatedView__row">
      <div class="JsonAnnotatedView__key-cell">
        <span class="JsonAnnotatedView__key">{key}</span>
        {#if FIELD_DESCRIPTIONS[key]}
          <span class="JsonAnnotatedView__desc">{FIELD_DESCRIPTIONS[key]}</span>
        {/if}
      </div>
      <div class="JsonAnnotatedView__value-cell">
        {#if READ_ONLY_FIELDS.has(key)}
          <span class="JsonAnnotatedView__value">{String(value)}</span>
        {:else if value === null}
          <input
            type="text"
            class="JsonAnnotatedView__input"
            value=""
            placeholder="auto"
            oninput={(e) => {
              const v = (e.target as HTMLInputElement).value.trim();
              update_field(key, v === "" ? null : v);
            }}
          />
        {:else if typeof value === "boolean"}
          <button
            type="button"
            class="JsonAnnotatedView__bool-toggle"
            class:JsonAnnotatedView__bool-toggle--on={value}
            onclick={() => update_field(key, !value)}
          >
            {String(value)}
          </button>
        {:else if is_color_value(value)}
          <span class="JsonAnnotatedView__swatch" style="background: {value};"
          ></span>
          <input
            type="text"
            class="JsonAnnotatedView__input JsonAnnotatedView__input--color"
            value={String(value)}
            oninput={(e) =>
              update_field(key, (e.target as HTMLInputElement).value)}
          />
        {:else if typeof value === "number"}
          <input
            type="number"
            class="JsonAnnotatedView__input JsonAnnotatedView__input--number"
            {value}
            step="any"
            oninput={(e) => {
              const n = parseFloat((e.target as HTMLInputElement).value);
              if (!isNaN(n)) update_field(key, n);
            }}
          />
        {:else}
          <input
            type="text"
            class="JsonAnnotatedView__input"
            value={String(value)}
            oninput={(e) =>
              update_field(key, (e.target as HTMLInputElement).value)}
          />
        {/if}
      </div>
    </div>
  {/each}

  <div class="JsonAnnotatedView__row JsonAnnotatedView__row--section-header">
    <div class="JsonAnnotatedView__key-cell">
      <span class="JsonAnnotatedView__key">token_overrides</span>
      {#if FIELD_DESCRIPTIONS.token_overrides}
        <span class="JsonAnnotatedView__desc"
          >{FIELD_DESCRIPTIONS.token_overrides}</span
        >
      {/if}
    </div>
    <div class="JsonAnnotatedView__value-cell">
      <button
        type="button"
        class="JsonAnnotatedView__toggle"
        onclick={() => {
          token_overrides_user_toggled = !token_overrides_expanded;
        }}
      >
        {override_entries.length} entries
        <span class="JsonAnnotatedView__chevron"
          >{token_overrides_expanded ? "▲" : "▼"}</span
        >
      </button>
    </div>
  </div>

  {#if token_overrides_expanded}
    {#each override_entries as [token, value]}
      <div class="JsonAnnotatedView__row JsonAnnotatedView__row--nested">
        <div class="JsonAnnotatedView__key-cell">
          <span class="JsonAnnotatedView__key JsonAnnotatedView__key--token"
            >{token}</span
          >
        </div>
        <div class="JsonAnnotatedView__value-cell">
          {#if is_color_value(value)}
            <span class="JsonAnnotatedView__swatch" style="background: {value};"
            ></span>
          {/if}
          <input
            type="text"
            class="JsonAnnotatedView__input JsonAnnotatedView__input--color"
            value={String(value)}
            oninput={(e) =>
              update_override(token, (e.target as HTMLInputElement).value)}
          />
          <button
            type="button"
            class="JsonAnnotatedView__remove-btn"
            title="Remove override"
            onclick={() => remove_override(token)}
          >
            &times;
          </button>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .JsonAnnotatedView {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.25rem);
    overflow: hidden;
    font-size: var(--text-xs);
  }

  .JsonAnnotatedView__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1-5) var(--space-3);
    border-bottom: 1px solid var(--border);
    min-height: 2rem;
    transition: background 80ms ease;
  }

  .JsonAnnotatedView__row:last-child {
    border-bottom: none;
  }

  .JsonAnnotatedView__row:hover {
    background: var(--muted);
  }

  .JsonAnnotatedView__row--nested {
    padding-left: calc(var(--space-3) * 2);
    background: color-mix(in oklch, var(--muted) 40%, transparent);
  }

  .JsonAnnotatedView__row--nested:hover {
    background: var(--muted);
  }

  .JsonAnnotatedView__row--section-header {
    background: color-mix(in oklch, var(--muted) 60%, transparent);
  }

  .JsonAnnotatedView__row--section-header:hover {
    background: var(--muted);
  }

  .JsonAnnotatedView__key-cell {
    flex: 0 0 auto;
    width: 50%;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
  }

  .JsonAnnotatedView__value-cell {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    min-width: 0;
  }

  .JsonAnnotatedView__key {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-xs);
    color: var(--foreground);
    flex-shrink: 0;
  }

  .JsonAnnotatedView__key--token {
    color: var(--muted-foreground);
    font-size: calc(var(--text-xs) * 0.95);
  }

  .JsonAnnotatedView__desc {
    color: var(--muted-foreground);
    font-size: calc(var(--text-xs) * 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .JsonAnnotatedView__value {
    font-family: var(--font-mono, ui-monospace, monospace);
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .JsonAnnotatedView__input {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-xs);
    color: var(--foreground);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius-sm, 0.25rem) * 0.75);
    padding: 1px var(--space-1-5);
    min-width: 0;
    flex: 1 1 auto;
    max-width: 100%;
  }

  .JsonAnnotatedView__input:focus {
    outline: 1px solid var(--ring);
    outline-offset: 0;
    background: color-mix(in oklch, var(--background) 80%, transparent);
  }

  .JsonAnnotatedView__input--color {
    flex: 1 1 auto;
  }

  .JsonAnnotatedView__input--number {
    max-width: 8rem;
  }

  .JsonAnnotatedView__bool-toggle {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    background: color-mix(in oklch, var(--muted) 60%, transparent);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius-sm, 0.25rem) * 0.75);
    padding: 1px var(--space-1-5);
    cursor: pointer;
    transition: all 80ms ease;
  }

  .JsonAnnotatedView__bool-toggle--on {
    color: var(--foreground);
    background: color-mix(in oklch, var(--primary) 15%, transparent);
    border-color: var(--primary);
  }

  .JsonAnnotatedView__bool-toggle:hover {
    border-color: var(--ring);
    color: var(--foreground);
  }

  .JsonAnnotatedView__swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .JsonAnnotatedView__remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
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
  }

  .JsonAnnotatedView__remove-btn:hover {
    color: var(--destructive, var(--foreground));
    border-color: var(--border);
    background: color-mix(in oklch, var(--muted) 60%, transparent);
  }

  .JsonAnnotatedView__toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
  }

  .JsonAnnotatedView__toggle:hover {
    color: var(--foreground);
  }

  .JsonAnnotatedView__chevron {
    font-size: 0.6em;
    line-height: 1;
  }
</style>
