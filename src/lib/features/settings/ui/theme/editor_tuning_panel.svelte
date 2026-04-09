<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Switch from "$lib/components/ui/switch/index.js";
  import { Slider } from "$lib/components/ui/slider";
  import { Input } from "$lib/components/ui/input";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import {
    DEFAULT_EDITOR_SETTINGS,
    EDITOR_SPACING_DENSITY_OPTIONS,
    EDITOR_CODE_BLOCK_RADIUS_OPTIONS,
    EDITOR_BLOCKQUOTE_BORDER_WIDTH_OPTIONS,
    EDITOR_LINK_UNDERLINE_STYLE_OPTIONS,
    EDITOR_DIVIDER_STYLE_OPTIONS,
  } from "$lib/shared/types/editor_settings";
  import type {
    EditorSettings,
    EditorSpacingDensity,
    EditorCodeBlockRadius,
    EditorLinkUnderlineStyle,
    EditorDividerStyle,
  } from "$lib/shared/types/editor_settings";

  type Props = {
    editor_settings: EditorSettings;
    on_update: <K extends keyof EditorSettings>(
      key: K,
      value: EditorSettings[K],
    ) => void;
  };

  let { editor_settings, on_update }: Props = $props();

  const density_options = EDITOR_SPACING_DENSITY_OPTIONS;
  const code_block_radius_options = EDITOR_CODE_BLOCK_RADIUS_OPTIONS;
  const blockquote_border_width_options =
    EDITOR_BLOCKQUOTE_BORDER_WIDTH_OPTIONS;
  const link_underline_style_options = EDITOR_LINK_UNDERLINE_STYLE_OPTIONS;
  const divider_style_options = EDITOR_DIVIDER_STYLE_OPTIONS;

  function is_default<K extends keyof EditorSettings>(key: K): boolean {
    return editor_settings[key] === DEFAULT_EDITOR_SETTINGS[key];
  }

  function reset<K extends keyof EditorSettings>(key: K) {
    on_update(key, DEFAULT_EDITOR_SETTINGS[key]);
  }
</script>

<div class="EditorTuningPanel">
  <div class="EditorTuningPanel__section-header">Spacing</div>
  <div class="EditorTuningPanel__section">
    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Max Width</span>
      <div class="EditorTuningPanel__controls">
        <Slider
          type="single"
          min={60}
          max={140}
          step={5}
          value={editor_settings.editor_max_width_ch}
          onValueChange={(v: number) => on_update("editor_max_width_ch", v)}
          class="w-28"
        />
        <span class="EditorTuningPanel__value"
          >{editor_settings.editor_max_width_ch}ch</span
        >
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_max_width_ch")}
          onclick={() => reset("editor_max_width_ch")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Headings</span>
      <div class="EditorTuningPanel__controls">
        <Select.Root
          type="single"
          value={editor_settings.editor_heading_spacing_density}
          onValueChange={(v: string | undefined) => {
            if (v)
              on_update(
                "editor_heading_spacing_density",
                v as EditorSpacingDensity,
              );
          }}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {density_options.find(
                (o) =>
                  o.value === editor_settings.editor_heading_spacing_density,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each density_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_heading_spacing_density")}
          onclick={() => reset("editor_heading_spacing_density")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Paragraphs</span>
      <div class="EditorTuningPanel__controls">
        <Select.Root
          type="single"
          value={editor_settings.editor_paragraph_spacing_density}
          onValueChange={(v: string | undefined) => {
            if (v)
              on_update(
                "editor_paragraph_spacing_density",
                v as EditorSpacingDensity,
              );
          }}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {density_options.find(
                (o) =>
                  o.value === editor_settings.editor_paragraph_spacing_density,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each density_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_paragraph_spacing_density")}
          onclick={() => reset("editor_paragraph_spacing_density")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Lists</span>
      <div class="EditorTuningPanel__controls">
        <Select.Root
          type="single"
          value={editor_settings.editor_list_spacing_density}
          onValueChange={(v: string | undefined) => {
            if (v)
              on_update(
                "editor_list_spacing_density",
                v as EditorSpacingDensity,
              );
          }}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {density_options.find(
                (o) => o.value === editor_settings.editor_list_spacing_density,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each density_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_list_spacing_density")}
          onclick={() => reset("editor_list_spacing_density")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Tables</span>
      <div class="EditorTuningPanel__controls">
        <Select.Root
          type="single"
          value={editor_settings.editor_table_spacing_density}
          onValueChange={(v: string | undefined) => {
            if (v)
              on_update(
                "editor_table_spacing_density",
                v as EditorSpacingDensity,
              );
          }}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {density_options.find(
                (o) => o.value === editor_settings.editor_table_spacing_density,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each density_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_table_spacing_density")}
          onclick={() => reset("editor_table_spacing_density")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>
  </div>

  <div class="EditorTuningPanel__section-header">Blocks</div>
  <div class="EditorTuningPanel__section">
    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Code Padding</span>
      <div class="EditorTuningPanel__controls">
        <Select.Root
          type="single"
          value={editor_settings.editor_code_block_padding}
          onValueChange={(v: string | undefined) => {
            if (v)
              on_update("editor_code_block_padding", v as EditorSpacingDensity);
          }}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {density_options.find(
                (o) => o.value === editor_settings.editor_code_block_padding,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each density_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_code_block_padding")}
          onclick={() => reset("editor_code_block_padding")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Code Radius</span>
      <div class="EditorTuningPanel__controls">
        <Select.Root
          type="single"
          value={editor_settings.editor_code_block_radius}
          onValueChange={(v: string | undefined) => {
            if (v)
              on_update("editor_code_block_radius", v as EditorCodeBlockRadius);
          }}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {code_block_radius_options.find(
                (o) => o.value === editor_settings.editor_code_block_radius,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each code_block_radius_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_code_block_radius")}
          onclick={() => reset("editor_code_block_radius")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Code Wrap</span>
      <div class="EditorTuningPanel__controls">
        <Switch.Root
          checked={editor_settings.editor_code_block_wrap}
          onCheckedChange={(v: boolean) =>
            on_update("editor_code_block_wrap", v)}
        />
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_code_block_wrap")}
          onclick={() => reset("editor_code_block_wrap")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Blockquote Padding</span>
      <div class="EditorTuningPanel__controls">
        <Select.Root
          type="single"
          value={editor_settings.editor_blockquote_padding}
          onValueChange={(v: string | undefined) => {
            if (v)
              on_update("editor_blockquote_padding", v as EditorSpacingDensity);
          }}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {density_options.find(
                (o) => o.value === editor_settings.editor_blockquote_padding,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each density_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_blockquote_padding")}
          onclick={() => reset("editor_blockquote_padding")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Blockquote Border</span>
      <div class="EditorTuningPanel__controls">
        <Select.Root
          type="single"
          value={String(editor_settings.editor_blockquote_border_width)}
          onValueChange={(v: string | undefined) => {
            if (v)
              on_update(
                "editor_blockquote_border_width",
                Number(v) as 2 | 3 | 4,
              );
          }}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {blockquote_border_width_options.find(
                (o) =>
                  o.value ===
                  String(editor_settings.editor_blockquote_border_width),
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each blockquote_border_width_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_blockquote_border_width")}
          onclick={() => reset("editor_blockquote_border_width")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>
  </div>

  <div class="EditorTuningPanel__section-header">Details</div>
  <div class="EditorTuningPanel__section">
    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Heading Markers</span>
      <div class="EditorTuningPanel__controls">
        <Switch.Root
          checked={editor_settings.editor_heading_markers}
          onCheckedChange={(v: boolean) =>
            on_update("editor_heading_markers", v)}
        />
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_heading_markers")}
          onclick={() => reset("editor_heading_markers")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Block Drag Handle</span>
      <div class="EditorTuningPanel__controls">
        <Switch.Root
          checked={editor_settings.editor_block_drag_handle}
          onCheckedChange={(v: boolean) =>
            on_update("editor_block_drag_handle", v)}
        />
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_block_drag_handle")}
          onclick={() => reset("editor_block_drag_handle")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Selection Color</span>
      <div class="EditorTuningPanel__controls">
        <Input
          type="text"
          value={editor_settings.editor_selection_color}
          placeholder="Theme default"
          class="w-36"
          oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
            on_update("editor_selection_color", e.currentTarget.value)}
        />
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_selection_color")}
          onclick={() => reset("editor_selection_color")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Link Underline</span>
      <div class="EditorTuningPanel__controls">
        <Select.Root
          type="single"
          value={editor_settings.editor_link_underline_style}
          onValueChange={(v: string | undefined) => {
            if (v)
              on_update(
                "editor_link_underline_style",
                v as EditorLinkUnderlineStyle,
              );
          }}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {link_underline_style_options.find(
                (o) => o.value === editor_settings.editor_link_underline_style,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each link_underline_style_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_link_underline_style")}
          onclick={() => reset("editor_link_underline_style")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Line Numbers</span>
      <div class="EditorTuningPanel__controls">
        <Switch.Root
          checked={editor_settings.source_editor_line_numbers}
          onCheckedChange={(v: boolean) =>
            on_update("source_editor_line_numbers", v)}
        />
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("source_editor_line_numbers")}
          onclick={() => reset("source_editor_line_numbers")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Spellcheck</span>
      <div class="EditorTuningPanel__controls">
        <Switch.Root
          checked={editor_settings.editor_spellcheck}
          onCheckedChange={(v: boolean) => on_update("editor_spellcheck", v)}
        />
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_spellcheck")}
          onclick={() => reset("editor_spellcheck")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>
  </div>

  <div class="EditorTuningPanel__section-header">Dividers</div>
  <div class="EditorTuningPanel__section">
    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Style</span>
      <div class="EditorTuningPanel__controls">
        <Select.Root
          type="single"
          value={editor_settings.editor_divider_style}
          onValueChange={(v: string | undefined) => {
            if (v) on_update("editor_divider_style", v as EditorDividerStyle);
          }}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {divider_style_options.find(
                (o) => o.value === editor_settings.editor_divider_style,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each divider_style_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_divider_style")}
          onclick={() => reset("editor_divider_style")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Thickness</span>
      <div class="EditorTuningPanel__controls">
        <Slider
          type="single"
          min={1}
          max={5}
          step={1}
          value={editor_settings.editor_divider_thickness_px}
          onValueChange={(v: number) =>
            on_update("editor_divider_thickness_px", v)}
          class="w-28"
        />
        <span class="EditorTuningPanel__value"
          >{editor_settings.editor_divider_thickness_px}px</span
        >
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_divider_thickness_px")}
          onclick={() => reset("editor_divider_thickness_px")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Color</span>
      <div class="EditorTuningPanel__controls">
        <Input
          type="text"
          value={editor_settings.editor_divider_color}
          placeholder="e.g. #888"
          class="w-36"
          oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
            on_update("editor_divider_color", e.currentTarget.value)}
        />
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_divider_color")}
          onclick={() => reset("editor_divider_color")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>

    <div class="EditorTuningPanel__row">
      <span class="EditorTuningPanel__label">Spacing</span>
      <div class="EditorTuningPanel__controls">
        <Select.Root
          type="single"
          value={editor_settings.editor_divider_spacing}
          onValueChange={(v: string | undefined) => {
            if (v)
              on_update("editor_divider_spacing", v as EditorSpacingDensity);
          }}
        >
          <Select.Trigger class="w-36">
            <span data-slot="select-value">
              {density_options.find(
                (o) => o.value === editor_settings.editor_divider_spacing,
              )?.label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each density_options as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <button
          type="button"
          class="EditorTuningPanel__reset"
          disabled={is_default("editor_divider_spacing")}
          onclick={() => reset("editor_divider_spacing")}
        >
          <RotateCcw />
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .EditorTuningPanel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .EditorTuningPanel__section-header {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted-foreground);
  }

  .EditorTuningPanel__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .EditorTuningPanel__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .EditorTuningPanel__label {
    font-size: var(--text-sm);
    color: var(--foreground);
    white-space: nowrap;
  }

  .EditorTuningPanel__controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .EditorTuningPanel__value {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    min-width: 3ch;
    text-align: right;
  }

  .EditorTuningPanel__reset {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm, 0.25rem);
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 100ms ease;
  }

  .EditorTuningPanel__reset:hover:not(:disabled) {
    opacity: 1;
    background: var(--muted);
  }

  .EditorTuningPanel__reset:disabled {
    opacity: 0.2;
    cursor: default;
  }

  :global(.EditorTuningPanel__reset svg) {
    width: 14px;
    height: 14px;
  }
</style>
