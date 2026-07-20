<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import type { Theme, ThemeSpacing } from "$lib/shared/types/theme";
  import {
    SANS_FONT_OPTIONS,
    MONO_FONT_OPTIONS,
  } from "$lib/shared/utils/theme_helpers";

  type Props = {
    theme: Theme;
    disabled?: boolean;
    on_update: (key: keyof Theme, value: Theme[keyof Theme]) => void;
  };

  let { theme, disabled = false, on_update }: Props = $props();

  const font_size_presets = [
    { value: 0.9375, label: "Small" },
    { value: 1.0, label: "Default" },
    { value: 1.0625, label: "Comfortable" },
    { value: 1.125, label: "Large" },
  ] as const;

  const spacing_presets: { value: ThemeSpacing; label: string }[] = [
    { value: "compact", label: "Compact" },
    { value: "normal", label: "Default" },
    { value: "spacious", label: "Comfortable" },
    { value: "extra_spacious", label: "Spacious" },
  ];

  const line_height_presets = [
    { value: 1.5, label: "Tight" },
    { value: 1.75, label: "Default" },
    { value: 1.85, label: "Relaxed" },
    { value: 2.1, label: "Loose" },
  ] as const;

  function closest_preset<T extends { value: number }>(
    presets: readonly T[],
    current: number,
  ): number {
    let best = presets[0]?.value ?? 0;
    let min_dist = Infinity;
    for (const p of presets) {
      const d = Math.abs(p.value - current);
      if (d < min_dist) {
        min_dist = d;
        best = p.value;
      }
    }
    return best;
  }
</script>

<div class="TypoPresets">
  <div class="TypoPresets__group">
    <span class="TypoPresets__label">Font Size</span>
    <div class="TypoPresets__buttons">
      {#each font_size_presets as preset (preset.value)}
        <button
          type="button"
          class="TypoPresets__btn"
          class:TypoPresets__btn--active={closest_preset(
            font_size_presets,
            theme.font_size,
          ) === preset.value}
          onclick={() => on_update("font_size", preset.value)}
          {disabled}
        >
          {preset.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="TypoPresets__group">
    <span class="TypoPresets__label">Spacing</span>
    <div class="TypoPresets__buttons">
      {#each spacing_presets as preset (preset.value)}
        <button
          type="button"
          class="TypoPresets__btn"
          class:TypoPresets__btn--active={theme.spacing === preset.value}
          onclick={() => on_update("spacing", preset.value)}
          {disabled}
        >
          {preset.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="TypoPresets__group">
    <span class="TypoPresets__label">Line Height</span>
    <div class="TypoPresets__buttons">
      {#each line_height_presets as preset (preset.value)}
        <button
          type="button"
          class="TypoPresets__btn"
          class:TypoPresets__btn--active={closest_preset(
            line_height_presets,
            theme.line_height,
          ) === preset.value}
          onclick={() => on_update("line_height", preset.value)}
          {disabled}
        >
          {preset.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="TypoPresets__row">
    <span class="TypoPresets__label">Sans Font</span>
    <Select.Root
      type="single"
      value={theme.font_family_sans}
      onValueChange={(v: string | undefined) => {
        if (v) on_update("font_family_sans", v);
      }}
      {disabled}
    >
      <Select.Trigger class="w-44">
        <span data-slot="select-value">{theme.font_family_sans}</span>
      </Select.Trigger>
      <Select.Content>
        {#each SANS_FONT_OPTIONS as opt (opt.value)}
          <Select.Item value={opt.value}>{opt.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <div class="TypoPresets__row">
    <span class="TypoPresets__label">Mono Font</span>
    <Select.Root
      type="single"
      value={theme.font_family_mono}
      onValueChange={(v: string | undefined) => {
        if (v) on_update("font_family_mono", v);
      }}
      {disabled}
    >
      <Select.Trigger class="w-44">
        <span data-slot="select-value">{theme.font_family_mono}</span>
      </Select.Trigger>
      <Select.Content>
        {#each MONO_FONT_OPTIONS as opt (opt.value)}
          <Select.Item value={opt.value}>{opt.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
</div>

<style>
  .TypoPresets {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .TypoPresets__group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .TypoPresets__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .TypoPresets__label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
    white-space: nowrap;
  }

  .TypoPresets__buttons {
    display: flex;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius, 0.375rem);
    overflow: hidden;
  }

  .TypoPresets__btn {
    flex: 1;
    padding: var(--space-1-5) var(--space-3);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    transition: all 100ms ease;
    white-space: nowrap;
  }

  .TypoPresets__btn:last-child {
    border-right: none;
  }

  .TypoPresets__btn:hover:not(:disabled) {
    background: var(--muted);
    color: var(--foreground);
  }

  .TypoPresets__btn--active {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .TypoPresets__btn--active:hover:not(:disabled) {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .TypoPresets__btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
