<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import Plus from "@lucide/svelte/icons/plus";
  import type { Theme } from "$lib/shared/types/theme";
  import {
    get_all_themes,
    group_themes_by_category,
  } from "$lib/shared/types/theme";

  type Props = {
    user_themes: Theme[];
    active_theme_id: string;
    on_switch: (theme_id: string) => void;
    on_create_click: () => void;
  };

  let { user_themes, active_theme_id, on_switch, on_create_click }: Props =
    $props();

  const all_themes = $derived(get_all_themes(user_themes));
  const active_theme = $derived(
    all_themes.find((t) => t.id === active_theme_id),
  );

  const builtin_themes = $derived(all_themes.filter((t) => t.is_builtin));
  const custom_themes = $derived(all_themes.filter((t) => !t.is_builtin));
  const grouped = $derived(group_themes_by_category(builtin_themes));

  function theme_swatch_colors(theme: Theme): { bg: string; accent: string } {
    const overrides = theme.token_overrides;
    const is_dark = theme.color_scheme === "dark";
    return {
      bg:
        overrides["--background"] ??
        (is_dark ? "oklch(0.15 0 0)" : "oklch(0.98 0 0)"),
      accent:
        overrides["--primary"] ??
        `oklch(${is_dark ? "0.65" : "0.45"} ${theme.accent_chroma} ${theme.accent_hue})`,
    };
  }
</script>

<div class="ThemeGallery">
  <Select.Root
    type="single"
    value={active_theme_id}
    onValueChange={(v) => {
      if (v) on_switch(v);
    }}
  >
    <Select.Trigger class="ThemeGallery__trigger">
      {#if active_theme}
        {@const colors = theme_swatch_colors(active_theme)}
        <span class="ThemeGallery__trigger-inner">
          <span
            class="ThemeGallery__dot"
            style="background: {colors.bg}; box-shadow: inset -4px 0 0 {colors.accent};"
          ></span>
          <span data-slot="select-value">{active_theme.name}</span>
        </span>
      {:else}
        <span data-slot="select-value">Select theme...</span>
      {/if}
    </Select.Trigger>
    <Select.Content class="ThemeGallery__content">
      {#each grouped as group (group.category)}
        <Select.Group>
          <Select.GroupHeading>{group.label}</Select.GroupHeading>
          {#each group.themes as theme (theme.id)}
            {@const colors = theme_swatch_colors(theme)}
            <Select.Item value={theme.id}>
              <span class="ThemeGallery__item">
                <span
                  class="ThemeGallery__dot"
                  style="background: {colors.bg}; box-shadow: inset -4px 0 0 {colors.accent};"
                ></span>
                {theme.name}
              </span>
            </Select.Item>
          {/each}
        </Select.Group>
      {/each}
      {#if custom_themes.length > 0}
        <Select.Separator />
        <Select.Group>
          <Select.GroupHeading>Custom</Select.GroupHeading>
          {#each custom_themes as theme (theme.id)}
            {@const colors = theme_swatch_colors(theme)}
            <Select.Item value={theme.id}>
              <span class="ThemeGallery__item">
                <span
                  class="ThemeGallery__dot"
                  style="background: {colors.bg}; box-shadow: inset -4px 0 0 {colors.accent};"
                ></span>
                {theme.name}
              </span>
            </Select.Item>
          {/each}
        </Select.Group>
      {/if}
    </Select.Content>
  </Select.Root>

  <button
    type="button"
    class="ThemeGallery__new-btn"
    onclick={on_create_click}
    title="Create new theme"
  >
    <Plus />
    New
  </button>
</div>

<style>
  .ThemeGallery {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  :global(.ThemeGallery__trigger) {
    min-width: 14rem;
  }

  .ThemeGallery__trigger-inner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  :global(.ThemeGallery__content) {
    max-height: 20rem;
  }

  .ThemeGallery__item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .ThemeGallery__dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .ThemeGallery__new-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1-5) var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--muted-foreground);
    background: transparent;
    border: 1px dashed var(--border);
    border-radius: var(--radius, 0.5rem);
    cursor: pointer;
    transition: all 100ms ease;
    white-space: nowrap;
  }

  .ThemeGallery__new-btn:hover {
    color: var(--foreground);
    border-color: var(--foreground);
  }

  :global(.ThemeGallery__new-btn svg) {
    width: 14px;
    height: 14px;
  }
</style>
