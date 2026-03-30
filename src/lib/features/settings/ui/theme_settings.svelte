<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Copy from "@lucide/svelte/icons/copy";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import {
    type Theme,
    type ColorSchemePreference,
    AVAILABLE_SHIKI_THEMES,
    get_all_themes,
  } from "$lib/shared/types/theme";
  import type { EditorSettings } from "$lib/shared/types/editor_settings";
  import ThemeGallery from "./theme/theme_gallery.svelte";
  import AccentPicker from "./theme/accent_picker.svelte";
  import TypographyPresets from "./theme/typography_presets.svelte";
  import ThemePreview from "./theme/theme_preview.svelte";
  import AdvancedPanel from "./theme/advanced_panel.svelte";
  import ColorPopover from "./theme/color_popover.svelte";

  type Props = {
    user_themes: Theme[];
    active_theme: Theme;
    color_scheme_preference: ColorSchemePreference;
    system_light_theme_id: string;
    system_dark_theme_id: string;
    editor_settings: EditorSettings;
    on_switch: (theme_id: string) => void;
    on_create: (name: string, base: Theme) => void;
    on_duplicate: (theme_id: string) => void;
    on_rename: (id: string, name: string) => void;
    on_delete: (theme_id: string) => void;
    on_update: (theme: Theme) => void;
    on_editor_update: <K extends keyof EditorSettings>(
      key: K,
      value: EditorSettings[K],
    ) => void;
    on_set_color_scheme_preference: (pref: ColorSchemePreference) => void;
    on_set_system_themes: (args: {
      light_id?: string;
      dark_id?: string;
    }) => void;
  };

  let {
    user_themes,
    active_theme,
    color_scheme_preference,
    system_light_theme_id,
    system_dark_theme_id,
    editor_settings,
    on_switch,
    on_create,
    on_duplicate,
    on_rename,
    on_delete,
    on_update,
    on_editor_update,
    on_set_color_scheme_preference,
    on_set_system_themes,
  }: Props = $props();

  const all_themes = $derived(get_all_themes(user_themes));
  const light_themes = $derived(
    all_themes.filter((t) => t.color_scheme === "light"),
  );
  const dark_themes = $derived(
    all_themes.filter((t) => t.color_scheme === "dark"),
  );

  const locked = $derived(active_theme.is_builtin);

  let new_theme_name = $state("");
  let show_create = $state(false);
  let show_advanced_user: boolean | null = $state(null);
  const has_overrides = $derived(
    Object.keys(active_theme.token_overrides).length > 0,
  );
  const show_advanced = $derived(
    show_advanced_user !== null ? show_advanced_user : has_overrides,
  );

  let popover_role = $state<string | null>(null);
  let popover_anchor = $state<HTMLElement | null>(null);

  function handle_create() {
    const name = new_theme_name.trim();
    if (!name) return;
    on_create(name, active_theme);
    new_theme_name = "";
    show_create = false;
  }

  function update<K extends keyof Theme>(key: K, value: Theme[K]) {
    if (locked) return;
    on_update({ ...active_theme, [key]: value });
  }

  function handle_accent_change(hue: number, chroma: number) {
    if (locked) return;
    on_update({ ...active_theme, accent_hue: hue, accent_chroma: chroma });
  }

  function handle_typo_update(key: keyof Theme, value: Theme[keyof Theme]) {
    if (locked) return;
    on_update({ ...active_theme, [key]: value });
  }

  function handle_element_click(role: string, anchor: HTMLElement) {
    if (locked) return;
    popover_role = role;
    popover_anchor = anchor;
  }

  const ROLE_TO_KEY: Record<string, keyof Theme> = {
    editor_text: "editor_text_color",
    bold: "bold_color",
    italic: "italic_color",
    link: "link_color",
    heading: "editor_text_color",
    blockquote: "blockquote_border_color",
    blockquote_text: "blockquote_text_color",
    code_block: "code_block_bg",
    code_block_text: "code_block_text_color",
    inline_code: "inline_code_bg",
    highlight: "highlight_bg",
  };

  const ROLE_LABELS: Record<string, string> = {
    editor_text: "Body Text",
    bold: "Bold",
    italic: "Italic",
    link: "Links",
    heading: "Headings",
    blockquote: "Blockquote Border",
    blockquote_text: "Blockquote Text",
    code_block: "Code Block BG",
    code_block_text: "Code Block Text",
    inline_code: "Inline Code BG",
    highlight: "Highlight BG",
  };

  function handle_popover_change(color: string) {
    if (!popover_role) return;
    const key = ROLE_TO_KEY[popover_role];
    if (key) update(key, color as never);
  }

  function handle_popover_reset() {
    if (!popover_role) return;
    const key = ROLE_TO_KEY[popover_role];
    if (key) update(key, null as never);
    popover_role = null;
    popover_anchor = null;
  }

  function handle_import(imported: Theme) {
    on_create(imported.name, imported);
  }

  const popover_color = $derived.by(() => {
    if (!popover_role) return "oklch(0.5 0.1 0)";
    const key = ROLE_TO_KEY[popover_role];
    if (!key) return "oklch(0.5 0.1 0)";
    return (active_theme[key] as string | null) ?? "oklch(0.5 0.1 0)";
  });

  const color_scheme_options = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];

  const appearance_options = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];

  const heading_color_options = [
    { value: "inherit", label: "Inherit" },
    { value: "primary", label: "Primary" },
    { value: "accent", label: "Accent" },
  ];

  const bold_style_options = [
    { value: "default", label: "Default" },
    { value: "heavier", label: "Heavy" },
    { value: "color-accent", label: "Accent Color" },
  ];

  const blockquote_style_options = [
    { value: "default", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "accent-bar", label: "Accent Bar" },
  ];

  const code_block_style_options = [
    { value: "default", label: "Default" },
    { value: "borderless", label: "Borderless" },
    { value: "filled", label: "Filled" },
  ];

  const shiki_light_options = AVAILABLE_SHIKI_THEMES.light.map((v) => ({
    value: v,
    label: v,
  }));
  const shiki_dark_options = AVAILABLE_SHIKI_THEMES.dark.map((v) => ({
    value: v,
    label: v,
  }));

  const SOURCE_MATCH = "__match__";
  const source_shiki_light_options = [
    { value: SOURCE_MATCH, label: "Match Code Theme" },
    ...shiki_light_options,
  ];
  const source_shiki_dark_options = [
    { value: SOURCE_MATCH, label: "Match Code Theme" },
    ...shiki_dark_options,
  ];

  function update_select<K extends keyof Theme>(
    key: K,
    value: string | undefined,
  ) {
    if (value !== undefined && value !== null && !locked) {
      on_update({ ...active_theme, [key]: value });
    }
  }
</script>

<div class="ThemeSettings">
  <!-- ─── Theme Gallery ─── -->
  <ThemeGallery
    {user_themes}
    active_theme_id={active_theme.id}
    {on_switch}
    on_create_click={() => {
      show_create = !show_create;
    }}
  />

  {#if show_create}
    <div class="ThemeSettings__create-row">
      <Input
        type="text"
        bind:value={new_theme_name}
        placeholder="Theme name..."
        class="flex-1"
        onkeydown={(e: KeyboardEvent) => {
          if (e.key === "Enter") handle_create();
        }}
      />
      <Button
        size="sm"
        onclick={handle_create}
        disabled={!new_theme_name.trim()}
      >
        Create
      </Button>
    </div>
  {/if}

  <!-- ─── Theme Actions ─── -->
  <div class="ThemeSettings__actions-bar">
    {#if !locked}
      <Input
        type="text"
        value={active_theme.name}
        onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
          on_rename(active_theme.id, e.currentTarget.value);
        }}
        class="w-40"
      />
    {:else}
      <span class="ThemeSettings__theme-name">{active_theme.name}</span>
    {/if}
    <div class="ThemeSettings__action-buttons">
      <Button
        variant="ghost"
        size="icon"
        onclick={() => on_duplicate(active_theme.id)}
        aria-label="Duplicate theme"
      >
        <Copy />
      </Button>
      {#if !locked}
        <Button
          variant="ghost"
          size="icon"
          onclick={() => on_delete(active_theme.id)}
          aria-label="Delete theme"
        >
          <Trash2 />
        </Button>
      {/if}
    </div>
  </div>

  {#if locked}
    <p class="ThemeSettings__hint">Duplicate this theme to customize it.</p>
  {/if}

  <!-- ─── Two-Column Layout ─── -->
  <div class="ThemeSettings__body">
    <!-- Controls Column -->
    <div class="ThemeSettings__controls">
      <!-- Appearance -->
      <div class="ThemeSettings__row">
        <span class="ThemeSettings__label">Appearance</span>
        <Select.Root
          type="single"
          value={color_scheme_preference}
          onValueChange={(v: string | undefined) => {
            if (v === "light" || v === "dark" || v === "system") {
              on_set_color_scheme_preference(v);
            }
          }}
        >
          <Select.Trigger class="w-28">
            <span data-slot="select-value">
              {appearance_options.find(
                (o) => o.value === color_scheme_preference,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each appearance_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      {#if color_scheme_preference === "system"}
        <!-- System Theme Pair -->
        <div class="ThemeSettings__row">
          <span class="ThemeSettings__label">Light Theme</span>
          <Select.Root
            type="single"
            value={system_light_theme_id}
            onValueChange={(v: string | undefined) => {
              if (v) on_set_system_themes({ light_id: v });
            }}
          >
            <Select.Trigger class="w-40">
              <span data-slot="select-value">
                {light_themes.find((t) => t.id === system_light_theme_id)
                  ?.name ?? "Select..."}
              </span>
            </Select.Trigger>
            <Select.Content>
              {#each light_themes as theme (theme.id)}
                <Select.Item value={theme.id}>{theme.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="ThemeSettings__row">
          <span class="ThemeSettings__label">Dark Theme</span>
          <Select.Root
            type="single"
            value={system_dark_theme_id}
            onValueChange={(v: string | undefined) => {
              if (v) on_set_system_themes({ dark_id: v });
            }}
          >
            <Select.Trigger class="w-40">
              <span data-slot="select-value">
                {dark_themes.find((t) => t.id === system_dark_theme_id)?.name ??
                  "Select..."}
              </span>
            </Select.Trigger>
            <Select.Content>
              {#each dark_themes as theme (theme.id)}
                <Select.Item value={theme.id}>{theme.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      {:else}
        <!-- Per-theme Color Scheme (non-system mode) -->
        <div class="ThemeSettings__row">
          <span class="ThemeSettings__label">Color Scheme</span>
          <Select.Root
            type="single"
            value={active_theme.color_scheme}
            onValueChange={(v: string | undefined) =>
              update_select("color_scheme", v)}
            disabled={locked}
          >
            <Select.Trigger class="w-28">
              <span data-slot="select-value">
                {color_scheme_options.find(
                  (o) => o.value === active_theme.color_scheme,
                )?.label}
              </span>
            </Select.Trigger>
            <Select.Content>
              {#each color_scheme_options as option (option.value)}
                <Select.Item value={option.value}>{option.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      {/if}

      <!-- Accent Color -->
      <AccentPicker
        hue={active_theme.accent_hue}
        chroma={active_theme.accent_chroma}
        on_change={handle_accent_change}
        disabled={locked}
      />

      <!-- Typography Presets -->
      <div class="ThemeSettings__section-header">Typography</div>
      <TypographyPresets
        theme={active_theme}
        disabled={locked}
        on_update={handle_typo_update}
      />

      <!-- Style Options -->
      <div class="ThemeSettings__section-header">Style</div>

      <div class="ThemeSettings__row">
        <span class="ThemeSettings__label">Heading Color</span>
        <Select.Root
          type="single"
          value={active_theme.heading_color}
          onValueChange={(v: string | undefined) =>
            update_select("heading_color", v)}
          disabled={locked}
        >
          <Select.Trigger class="w-28">
            <span data-slot="select-value">
              {heading_color_options.find(
                (o) => o.value === active_theme.heading_color,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each heading_color_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="ThemeSettings__row">
        <span class="ThemeSettings__label">Bold Style</span>
        <Select.Root
          type="single"
          value={active_theme.bold_style}
          onValueChange={(v: string | undefined) =>
            update_select("bold_style", v)}
          disabled={locked}
        >
          <Select.Trigger class="w-32">
            <span data-slot="select-value">
              {bold_style_options.find(
                (o) => o.value === active_theme.bold_style,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each bold_style_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="ThemeSettings__row">
        <span class="ThemeSettings__label">Blockquote</span>
        <Select.Root
          type="single"
          value={active_theme.blockquote_style}
          onValueChange={(v: string | undefined) =>
            update_select("blockquote_style", v)}
          disabled={locked}
        >
          <Select.Trigger class="w-32">
            <span data-slot="select-value">
              {blockquote_style_options.find(
                (o) => o.value === active_theme.blockquote_style,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each blockquote_style_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="ThemeSettings__row">
        <span class="ThemeSettings__label">Code Blocks</span>
        <Select.Root
          type="single"
          value={active_theme.code_block_style}
          onValueChange={(v: string | undefined) =>
            update_select("code_block_style", v)}
          disabled={locked}
        >
          <Select.Trigger class="w-32">
            <span data-slot="select-value">
              {code_block_style_options.find(
                (o) => o.value === active_theme.code_block_style,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each code_block_style_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <!-- Code Theme -->
      <div class="ThemeSettings__row">
        <span class="ThemeSettings__label">Code Theme (Light)</span>
        <Select.Root
          type="single"
          value={active_theme.shiki_theme_light}
          onValueChange={(v: string | undefined) =>
            update_select("shiki_theme_light", v)}
          disabled={locked}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {active_theme.shiki_theme_light}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each shiki_light_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="ThemeSettings__row">
        <span class="ThemeSettings__label">Code Theme (Dark)</span>
        <Select.Root
          type="single"
          value={active_theme.shiki_theme_dark}
          onValueChange={(v: string | undefined) =>
            update_select("shiki_theme_dark", v)}
          disabled={locked}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {active_theme.shiki_theme_dark}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each shiki_dark_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <!-- Source Editor Theme -->
      <div class="ThemeSettings__row">
        <span class="ThemeSettings__label">Source Theme (Light)</span>
        <Select.Root
          type="single"
          value={active_theme.source_shiki_theme_light || SOURCE_MATCH}
          onValueChange={(v: string | undefined) =>
            update_select(
              "source_shiki_theme_light",
              v === SOURCE_MATCH ? "" : v,
            )}
          disabled={locked}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {active_theme.source_shiki_theme_light || "Match Code Theme"}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each source_shiki_light_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="ThemeSettings__row">
        <span class="ThemeSettings__label">Source Theme (Dark)</span>
        <Select.Root
          type="single"
          value={active_theme.source_shiki_theme_dark || SOURCE_MATCH}
          onValueChange={(v: string | undefined) =>
            update_select(
              "source_shiki_theme_dark",
              v === SOURCE_MATCH ? "" : v,
            )}
          disabled={locked}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {active_theme.source_shiki_theme_dark || "Match Code Theme"}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each source_shiki_dark_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <!-- Advanced Toggle -->
      <button
        type="button"
        class="ThemeSettings__advanced-toggle"
        onclick={() => {
          show_advanced_user = !show_advanced;
        }}
      >
        <ChevronDown
          class="ThemeSettings__chevron {show_advanced
            ? 'ThemeSettings__chevron--open'
            : ''}"
        />
        Advanced
      </button>

      {#if show_advanced}
        <AdvancedPanel
          theme={active_theme}
          disabled={locked}
          {editor_settings}
          on_update={(t) => on_update(t)}
          on_reset_color={(key) => update(key, null as never)}
          on_import={handle_import}
          {on_editor_update}
        />
      {/if}
    </div>

    <!-- Preview Column -->
    <div class="ThemeSettings__preview">
      <ThemePreview
        interactive={!locked}
        on_element_click={handle_element_click}
      />
      {#if !locked}
        <span class="ThemeSettings__preview-hint"
          >Click elements to customize colors</span
        >
      {/if}
    </div>
  </div>

  <!-- Color Popover (inline below preview) -->
  {#if popover_role}
    <div class="ThemeSettings__popover-overlay">
      <ColorPopover
        role_label={ROLE_LABELS[popover_role] ?? popover_role}
        color={popover_color}
        on_change={handle_popover_change}
        on_reset={handle_popover_reset}
        on_close={() => {
          popover_role = null;
          popover_anchor = null;
        }}
      />
    </div>
  {/if}
</div>

<style>
  .ThemeSettings {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .ThemeSettings__create-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .ThemeSettings__actions-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .ThemeSettings__theme-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--foreground);
  }

  .ThemeSettings__action-buttons {
    display: flex;
    gap: var(--space-1);
  }

  .ThemeSettings__hint {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    font-style: italic;
    padding: var(--space-2) var(--space-3);
    background: var(--muted);
    border-radius: var(--radius-md);
  }

  .ThemeSettings__body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-5);
    align-items: start;
  }

  @media (max-width: 640px) {
    .ThemeSettings__body {
      grid-template-columns: 1fr;
    }
  }

  .ThemeSettings__controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .ThemeSettings__preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    position: sticky;
    top: var(--space-4);
  }

  .ThemeSettings__preview-hint {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    text-align: center;
  }

  .ThemeSettings__section-header {
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border);
  }

  .ThemeSettings__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .ThemeSettings__label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
    white-space: nowrap;
  }

  .ThemeSettings__advanced-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: var(--space-2) 0;
    transition: color 100ms ease;
  }

  .ThemeSettings__advanced-toggle:hover {
    color: var(--foreground);
  }

  :global(.ThemeSettings__chevron) {
    width: 16px;
    height: 16px;
    transition: transform 150ms ease;
  }

  :global(.ThemeSettings__chevron--open) {
    transform: rotate(180deg);
  }

  .ThemeSettings__popover-overlay {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius, 0.5rem);
    box-shadow: var(--shadow-lg, 0 10px 30px oklch(0 0 0 / 15%));
  }
</style>
