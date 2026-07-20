<script lang="ts">
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import type { Theme } from "$lib/shared/types/theme";

  type Props = {
    theme: Theme;
    disabled?: boolean;
    on_reset: (key: keyof Theme) => void;
  };

  let { theme, disabled = false, on_reset }: Props = $props();

  type ColorEntry = { key: keyof Theme; label: string; value: string };

  const COLOR_FIELDS: { key: keyof Theme; label: string }[] = [
    { key: "editor_text_color", label: "Body Text" },
    { key: "link_color", label: "Links" },
    { key: "bold_color", label: "Bold" },
    { key: "italic_color", label: "Italic" },
    { key: "blockquote_border_color", label: "Blockquote Border" },
    { key: "blockquote_text_color", label: "Blockquote Text" },
    { key: "code_block_bg", label: "Code Block BG" },
    { key: "code_block_text_color", label: "Code Block Text" },
    { key: "inline_code_bg", label: "Inline Code BG" },
    { key: "inline_code_text_color", label: "Inline Code Text" },
    { key: "highlight_bg", label: "Highlight BG" },
    { key: "highlight_text_color", label: "Highlight Text" },
  ];

  const overrides: ColorEntry[] = $derived(
    COLOR_FIELDS.filter((f) => theme[f.key] !== null).map((f) => ({
      key: f.key,
      label: f.label,
      value: theme[f.key] as string,
    })),
  );
</script>

{#if overrides.length > 0}
  <div class="OverrideSummary">
    <span class="OverrideSummary__title">Color Overrides</span>
    <div class="OverrideSummary__list">
      {#each overrides as entry (entry.key)}
        <div class="OverrideSummary__row">
          <span
            class="OverrideSummary__swatch"
            style="background: {entry.value}"
          ></span>
          <span class="OverrideSummary__label">{entry.label}</span>
          <button
            type="button"
            class="OverrideSummary__reset"
            onclick={() => on_reset(entry.key)}
            {disabled}
            title="Reset to auto"
          >
            <RotateCcw />
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .OverrideSummary {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .OverrideSummary__title {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .OverrideSummary__list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .OverrideSummary__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--muted);
  }

  .OverrideSummary__swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .OverrideSummary__label {
    font-size: var(--text-xs);
    color: var(--foreground);
    flex: 1;
  }

  .OverrideSummary__reset {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    opacity: 0.5;
    transition: all 100ms ease;
  }

  .OverrideSummary__reset:hover:not(:disabled) {
    opacity: 1;
    color: var(--destructive);
  }

  .OverrideSummary__reset:disabled {
    opacity: 0.2;
    cursor: default;
  }

  :global(.OverrideSummary__reset svg) {
    width: 12px;
    height: 12px;
  }
</style>
