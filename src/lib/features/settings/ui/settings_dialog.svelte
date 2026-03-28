<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Switch from "$lib/components/ui/switch/index.js";
  import { Slider } from "$lib/components/ui/slider";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import PaletteIcon from "@lucide/svelte/icons/palette";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import LayoutIcon from "@lucide/svelte/icons/layout-template";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import GitBranchIcon from "@lucide/svelte/icons/git-branch";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import TerminalIcon from "@lucide/svelte/icons/terminal";
  import SlidersIcon from "@lucide/svelte/icons/sliders-horizontal";
  import BrainIcon from "@lucide/svelte/icons/brain";
  import NetworkIcon from "@lucide/svelte/icons/network";
  import KeyboardIcon from "@lucide/svelte/icons/keyboard";
  import WrenchIcon from "@lucide/svelte/icons/wrench";
  import { HotkeysPanel } from "$lib/features/hotkey";
  import ThemeSettings from "$lib/features/settings/ui/theme_settings.svelte";
  import IgnoredFoldersInput from "$lib/features/settings/ui/ignored_folders_input.svelte";
  import type {
    DocumentImageBackground,
    DocumentPdfScrollMode,
    DocumentPdfZoomMode,
    EditorBlockquotePadding,
    EditorCodeBlockPadding,
    EditorCodeBlockRadius,
    EditorDividerStyle,
    EditorLinkUnderlineStyle,
    EditorSpacingDensity,
    EditorSettings,
    GitAutocommitMode,
    GitPullStrategy,
    LintFormatter,
    FileTreeStyle,
    FileTreeBlurbPosition,
    OutlineMode,
    TerminalFontWeight,
    TerminalCursorStyle,
    SettingsCategory,
  } from "$lib/shared/types/editor_settings";
  import {
    DEFAULT_EDITOR_SETTINGS,
    type MarkdownLspProvider,
  } from "$lib/shared/types/editor_settings";
  import type { IweConfigStatus } from "$lib/features/marksman";
  import type {
    AiProviderConfig,
    AiTransport,
  } from "$lib/shared/types/ai_provider_config";
  import type { Theme, ColorSchemePreference } from "$lib/shared/types/theme";
  import type { HotkeyConfig, HotkeyBinding } from "$lib/features/hotkey";
  import { slide } from "svelte/transition";
  import { draggable } from "$lib/shared/utils/draggable";
  import { resizable_element } from "$lib/shared/utils/resizable_element";

  type Props = {
    open: boolean;
    editor_settings: EditorSettings;
    folder_paths: string[];
    git_enabled: boolean;
    git_remote_url: string;
    active_category: SettingsCategory;
    is_saving: boolean;
    has_unsaved_changes: boolean;
    error: string | null;
    hotkeys_config: HotkeyConfig;
    user_themes: Theme[];
    active_theme: Theme;
    on_update_settings: (settings: EditorSettings) => void;
    on_git_remote_url_change: (url: string) => void;
    on_category_change: (category: SettingsCategory) => void;
    on_save: () => void;
    on_close: () => void;
    on_hotkey_edit: (binding: HotkeyBinding) => void;
    on_hotkey_clear: (action_id: string) => void;
    on_hotkey_reset_single: (action_id: string) => void;
    on_hotkey_reset_all: () => void;
    on_theme_switch: (theme_id: string) => void;
    on_theme_create: (name: string, base: Theme) => void;
    on_theme_duplicate: (theme_id: string) => void;
    on_theme_rename: (id: string, name: string) => void;
    on_theme_delete: (theme_id: string) => void;
    on_theme_update: (theme: Theme) => void;
    color_scheme_preference: ColorSchemePreference;
    system_light_theme_id: string;
    system_dark_theme_id: string;
    on_theme_set_color_scheme_preference: (pref: ColorSchemePreference) => void;
    on_theme_set_system_themes: (args: {
      light_id?: string;
      dark_id?: string;
    }) => void;
    iwe_config_status: IweConfigStatus | null;
    on_iwe_open_config: () => void;
    on_iwe_reset_config: () => void;
  };

  let {
    open,
    editor_settings,
    folder_paths,
    git_enabled,
    git_remote_url,
    active_category,
    is_saving,
    has_unsaved_changes,
    error,
    hotkeys_config,
    user_themes,
    active_theme,
    on_update_settings,
    on_git_remote_url_change,
    on_category_change,
    on_save,
    on_close,
    on_hotkey_edit,
    on_hotkey_clear,
    on_hotkey_reset_single,
    on_hotkey_reset_all,
    on_theme_switch,
    on_theme_create,
    on_theme_duplicate,
    on_theme_rename,
    on_theme_delete,
    on_theme_update,
    color_scheme_preference,
    system_light_theme_id,
    system_dark_theme_id,
    on_theme_set_color_scheme_preference,
    on_theme_set_system_themes,
    iwe_config_status,
    on_iwe_open_config,
    on_iwe_reset_config,
  }: Props = $props();

  const tab_count_options = Array.from({ length: 10 }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  }));

  const autocommit_mode_options: { value: GitAutocommitMode; label: string }[] =
    [
      { value: "off", label: "Off" },
      { value: "on_save", label: "On Save" },
      { value: "interval", label: "Every N Minutes" },
    ];

  const interval_options = [1, 2, 5, 10, 15, 30].map((n) => ({
    value: String(n),
    label: `${String(n)} min`,
  }));

  const pull_strategy_options: { value: GitPullStrategy; label: string }[] = [
    { value: "merge", label: "Merge" },
    { value: "rebase", label: "Rebase" },
    { value: "ff_only", label: "Fast-forward only" },
  ];

  const lint_formatter_options: { value: LintFormatter; label: string }[] = [
    { value: "prettier", label: "Prettier" },
    { value: "rumdl", label: "rumdl" },
  ];

  const auto_fetch_interval_options = [0, 5, 15, 30, 60].map((n) => ({
    value: String(n),
    label: n === 0 ? "Off" : `${String(n)} min`,
  }));

  const terminal_font_size_options = [11, 12, 13, 14, 15, 16, 18].map((n) => ({
    value: String(n),
    label: `${String(n)} px`,
  }));

  const terminal_font_weight_options: {
    value: TerminalFontWeight;
    label: string;
  }[] = [
    { value: "normal", label: "Normal" },
    { value: "bold", label: "Bold" },
    { value: "100", label: "100" },
    { value: "200", label: "200" },
    { value: "300", label: "300" },
    { value: "400", label: "400" },
    { value: "500", label: "500" },
    { value: "600", label: "600" },
    { value: "700", label: "700" },
    { value: "800", label: "800" },
    { value: "900", label: "900" },
  ];

  const terminal_cursor_style_options: {
    value: TerminalCursorStyle;
    label: string;
  }[] = [
    { value: "block", label: "Block" },
    { value: "underline", label: "Underline" },
    { value: "bar", label: "Bar" },
  ];

  const terminal_scrollback_options = [100, 500, 1000, 2000, 5000, 10000].map(
    (n) => ({
      value: String(n),
      label: n >= 1000 ? `${String(n / 1000)}k` : String(n),
    }),
  );

  const ai_timeout_options = [60, 120, 300, 600].map((n) => ({
    value: String(n),
    label: n >= 60 ? `${String(n / 60)} min` : `${String(n)} sec`,
  }));

  const transport_kind_options = [
    { value: "cli", label: "CLI" },
    { value: "api", label: "API" },
  ];

  let editing_provider_id = $state<string | null>(null);
  let new_provider = $state<{
    id: string;
    name: string;
    transport_kind: "cli" | "api";
    command: string;
    args: string;
    base_url: string;
    api_key_env: string;
    model: string;
  } | null>(null);

  function update_provider(
    id: string,
    updates: {
      [K in keyof AiProviderConfig]?: AiProviderConfig[K] | undefined;
    },
  ) {
    const providers = [...editor_settings.ai_providers];
    const idx = providers.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const merged = Object.assign({}, providers[idx]) as AiProviderConfig;
    for (const key of Object.keys(updates) as (keyof AiProviderConfig)[]) {
      const val = updates[key];
      if (val === undefined) {
        delete merged[key];
      } else {
        (merged as Record<string, unknown>)[key] = val;
      }
    }
    providers[idx] = merged;
    update("ai_providers", providers);
  }

  function remove_provider(id: string) {
    const providers = editor_settings.ai_providers.filter((p) => p.id !== id);
    update("ai_providers", providers);
    if (editor_settings.ai_default_provider_id === id) {
      update("ai_default_provider_id", "auto");
    }
  }

  function provider_summary(p: AiProviderConfig): string {
    if (p.transport.kind === "cli") {
      const parts = [p.transport.command, ...p.transport.args];
      return parts.join(" ");
    }
    return p.transport.base_url;
  }

  function add_provider() {
    if (!new_provider || !new_provider.id.trim() || !new_provider.name.trim())
      return;
    const trimmed_model = new_provider.model.trim();
    let provider: AiProviderConfig;
    if (new_provider.transport_kind === "api") {
      if (!new_provider.base_url.trim()) return;
      provider = {
        id: new_provider.id.trim(),
        name: new_provider.name.trim(),
        transport: {
          kind: "api",
          base_url: new_provider.base_url.trim(),
          ...(new_provider.api_key_env.trim()
            ? { api_key_env: new_provider.api_key_env.trim() }
            : {}),
        },
        ...(trimmed_model ? { model: trimmed_model } : {}),
      };
    } else {
      if (!new_provider.command.trim()) return;
      const args = new_provider.args
        .trim()
        .split(/\s+/)
        .filter((a) => a.length > 0);
      provider = {
        id: new_provider.id.trim(),
        name: new_provider.name.trim(),
        transport: {
          kind: "cli",
          command: new_provider.command.trim(),
          args,
        },
        ...(trimmed_model ? { model: trimmed_model } : {}),
      };
    }
    const providers = [...editor_settings.ai_providers, provider];
    update("ai_providers", providers);
    new_provider = null;
  }

  function move_provider(id: string, direction: -1 | 1) {
    const providers = [...editor_settings.ai_providers];
    const idx = providers.findIndex((p) => p.id === id);
    const target = idx + direction;
    if (target < 0 || target >= providers.length) return;
    const tmp = providers[idx]!;
    providers[idx] = providers[target]!;
    providers[target] = tmp;
    update("ai_providers", providers);
  }

  const pdf_zoom_options: { value: DocumentPdfZoomMode; label: string }[] = [
    { value: "actual_size", label: "Actual Size" },
    { value: "fit_width", label: "Fit Width" },
  ];

  const pdf_scroll_mode_options: {
    value: DocumentPdfScrollMode;
    label: string;
  }[] = [
    { value: "continuous", label: "Continuous" },
    { value: "paginated", label: "Paginated" },
  ];

  const image_background_options: {
    value: DocumentImageBackground;
    label: string;
  }[] = [
    { value: "checkerboard", label: "Checkerboard" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];

  const document_cache_limit_options = [1, 2, 3, 5, 8].map((n) => ({
    value: String(n),
    label: `${String(n)} documents`,
  }));

  const density_options = [
    { value: "extra_compact", label: "Extra Compact" },
    { value: "compact", label: "Compact" },
    { value: "normal", label: "Normal" },
    { value: "relaxed", label: "Relaxed" },
    { value: "spacious", label: "Spacious" },
  ] as const;

  const code_block_radius_options: {
    value: EditorCodeBlockRadius;
    label: string;
  }[] = [
    { value: "tight", label: "Tight" },
    { value: "normal", label: "Normal" },
    { value: "soft", label: "Soft" },
  ];

  const blockquote_border_width_options = [2, 3, 4].map((n) => ({
    value: String(n),
    label: `${String(n)} px`,
  }));

  const link_underline_style_options: {
    value: EditorLinkUnderlineStyle;
    label: string;
  }[] = [
    { value: "solid", label: "Solid" },
    { value: "dotted", label: "Dotted" },
    { value: "wavy", label: "Wavy" },
  ];

  const divider_style_options: {
    value: EditorDividerStyle;
    label: string;
  }[] = [
    { value: "gradient", label: "Gradient" },
    { value: "solid", label: "Solid" },
    { value: "dashed", label: "Dashed" },
    { value: "dotted", label: "Dotted" },
  ];

  function update<K extends keyof EditorSettings>(
    key: K,
    value: EditorSettings[K],
  ) {
    on_update_settings({ ...editor_settings, [key]: value });
  }

  const categories: {
    id: SettingsCategory;
    label: string;
    icon: typeof PaletteIcon;
  }[] = [
    { id: "theme", label: "Theme", icon: PaletteIcon },
    { id: "ai", label: "AI", icon: SparklesIcon },
    { id: "layout", label: "Layout", icon: LayoutIcon },
    { id: "files", label: "Files", icon: FolderIcon },
    { id: "git", label: "Git", icon: GitBranchIcon },
    { id: "documents", label: "Documents", icon: FileTextIcon },
    { id: "terminal", label: "Terminal", icon: TerminalIcon },
    { id: "graph", label: "Graph", icon: NetworkIcon },
    { id: "semantic", label: "Semantic", icon: BrainIcon },
    { id: "misc", label: "Misc", icon: SlidersIcon },
    { id: "toolchain", label: "Tools", icon: WrenchIcon },
    { id: "hotkeys", label: "Hotkeys", icon: KeyboardIcon },
  ];

  const ai_settings_disabled = $derived(!editor_settings.ai_enabled);
  let dialog_element = $state<HTMLElement | null>(null);

  function reset_drag_styles() {
    if (!dialog_element) return;
    dialog_element.style.left = "";
    dialog_element.style.top = "";
    dialog_element.style.width = "";
    dialog_element.style.height = "";
    dialog_element.style.maxWidth = "";
    dialog_element.style.maxHeight = "";
    dialog_element.style.transform = "";
    dialog_element.style.translate = "";
    dialog_element.style.transition = "";
    dialog_element.style.cursor = "";
  }

  function request_close() {
    if (is_saving) return;
    reset_drag_styles();
    on_close();
  }

  $effect(() => {
    if (!dialog_element) return;

    const element = dialog_element;
    const drag_action = draggable(element, {
      handle_selector: ".SettingsDialog__drag-handle",
    });
    const resize_action = resizable_element(element, {
      min_width: 550,
      min_height: 320,
      max_width: window.innerWidth - 40,
      max_height: window.innerHeight - 40,
    });

    return () => {
      drag_action.destroy();
      resize_action.destroy();
    };
  });

  $effect(() => {
    if (!open) {
      reset_drag_styles();
    }
  });
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value) {
      request_close();
    }
  }}
>
  <Dialog.Content bind:ref={dialog_element} class="SettingsDialog">
    <Dialog.Header class="sr-only">
      <Dialog.Title>Settings</Dialog.Title>
      <Dialog.Description>Customize your editor experience</Dialog.Description>
    </Dialog.Header>

    <div class="SettingsDialog__panels">
      <nav class="SettingsDialog__nav">
        <div class="SettingsDialog__nav-header SettingsDialog__drag-handle">
          Settings
        </div>
        {#each categories as cat (cat.id)}
          <button
            class="SettingsDialog__nav-item"
            class:SettingsDialog__nav-item--selected={active_category ===
              cat.id}
            onclick={() => {
              on_category_change(cat.id);
            }}
          >
            <cat.icon />
            <span>{cat.label}</span>
          </button>
        {/each}
      </nav>

      <div class="SettingsDialog__content">
        {#if active_category === "theme"}
          <h2 class="SettingsDialog__content-header">Theme</h2>

          <ThemeSettings
            {user_themes}
            {active_theme}
            {color_scheme_preference}
            {system_light_theme_id}
            {system_dark_theme_id}
            on_switch={on_theme_switch}
            on_create={on_theme_create}
            on_duplicate={on_theme_duplicate}
            on_rename={on_theme_rename}
            on_delete={on_theme_delete}
            on_update={on_theme_update}
            on_set_color_scheme_preference={on_theme_set_color_scheme_preference}
            on_set_system_themes={on_theme_set_system_themes}
          />
        {:else if active_category === "ai"}
          <h2 class="SettingsDialog__content-header">AI</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Enable AI</span>
                <span class="SettingsDialog__description"
                  >Show AI tools and allow local AI assistant execution</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.ai_enabled}
                onCheckedChange={(v: boolean) => {
                  update("ai_enabled", v);
                }}
              />
            </div>

            {#if ai_settings_disabled}
              <div
                class="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
              >
                AI tools are hidden and provider CLIs will not be invoked while
                AI is disabled.
              </div>
            {/if}

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Default Provider</span>
                <span class="SettingsDialog__description">
                  Auto selects the first available CLI in configured order
                </span>
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={editor_settings.ai_default_provider_id}
                  onValueChange={(v: string | undefined) => {
                    if (v) update("ai_default_provider_id", v);
                  }}
                  disabled={ai_settings_disabled}
                >
                  <Select.Trigger class="w-36">
                    <span data-slot="select-value">
                      {editor_settings.ai_default_provider_id === "auto"
                        ? "Auto"
                        : (editor_settings.ai_providers.find(
                            (p) =>
                              p.id === editor_settings.ai_default_provider_id,
                          )?.name ?? editor_settings.ai_default_provider_id)}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="auto">Auto</Select.Item>
                    {#each editor_settings.ai_providers as p (p.id)}
                      <Select.Item value={p.id}>{p.name}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "ai_default_provider_id",
                      DEFAULT_EDITOR_SETTINGS.ai_default_provider_id,
                    )}
                  disabled={ai_settings_disabled ||
                    editor_settings.ai_default_provider_id ===
                      DEFAULT_EDITOR_SETTINGS.ai_default_provider_id}
                  title={`Reset to default (${DEFAULT_EDITOR_SETTINGS.ai_default_provider_id})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Providers</span>
                  <span class="SettingsDialog__description">
                    CLI tools used for AI assistance. Order determines
                    auto-detection priority.
                  </span>
                </div>
              </div>

              {#each editor_settings.ai_providers as provider, i (provider.id)}
                <div class="rounded-md border p-3 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <span class="text-sm font-medium">{provider.name}</span>
                      {#if provider.model}
                        <span class="ml-2 text-xs text-muted-foreground"
                          >({provider.model})</span
                        >
                      {/if}
                      <div
                        class="text-xs text-muted-foreground font-mono truncate"
                      >
                        {provider_summary(provider)}
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        class="SettingsDialog__reset"
                        onclick={() => move_provider(provider.id, -1)}
                        disabled={ai_settings_disabled || i === 0}
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        class="SettingsDialog__reset"
                        onclick={() => move_provider(provider.id, 1)}
                        disabled={ai_settings_disabled ||
                          i === editor_settings.ai_providers.length - 1}
                        title="Move down"
                      >
                        ▼
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() =>
                          (editing_provider_id =
                            editing_provider_id === provider.id
                              ? null
                              : provider.id)}
                        disabled={ai_settings_disabled}
                      >
                        {editing_provider_id === provider.id ? "Done" : "Edit"}
                      </Button>
                      {#if !provider.is_preset}
                        <Button
                          variant="ghost"
                          size="sm"
                          onclick={() => remove_provider(provider.id)}
                          disabled={ai_settings_disabled}
                        >
                          Remove
                        </Button>
                      {/if}
                    </div>
                  </div>

                  {#if editing_provider_id === provider.id}
                    <div class="space-y-2 border-t pt-2">
                      <div class="flex items-center gap-2">
                        <span class="w-20 text-xs text-muted-foreground"
                          >Name</span
                        >
                        <Input
                          type="text"
                          value={provider.name}
                          class="flex-1"
                          disabled={ai_settings_disabled}
                          oninput={(
                            e: Event & { currentTarget: HTMLInputElement },
                          ) =>
                            update_provider(provider.id, {
                              name: e.currentTarget.value,
                            })}
                        />
                      </div>
                      {#if provider.transport.kind === "cli"}
                        <div class="flex items-center gap-2">
                          <span class="w-20 text-xs text-muted-foreground"
                            >Command</span
                          >
                          <Input
                            type="text"
                            value={provider.transport.command}
                            class="flex-1"
                            disabled={ai_settings_disabled}
                            oninput={(
                              e: Event & { currentTarget: HTMLInputElement },
                            ) =>
                              update_provider(provider.id, {
                                transport: {
                                  kind: "cli",
                                  command: e.currentTarget.value,
                                  args:
                                    provider.transport.kind === "cli"
                                      ? provider.transport.args
                                      : [],
                                },
                              })}
                          />
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="w-20 text-xs text-muted-foreground"
                            >Args</span
                          >
                          <Input
                            type="text"
                            value={provider.transport.args.join(" ")}
                            class="flex-1 font-mono text-xs"
                            placeholder="{'{' + 'model}'} or -p {'{' +
                              'prompt}'}"
                            disabled={ai_settings_disabled}
                            oninput={(
                              e: Event & { currentTarget: HTMLInputElement },
                            ) => {
                              const args = e.currentTarget.value
                                .split(/\s+/)
                                .filter((a) => a.length > 0);
                              update_provider(provider.id, {
                                transport: {
                                  kind: "cli",
                                  command:
                                    provider.transport.kind === "cli"
                                      ? provider.transport.command
                                      : "",
                                  args,
                                },
                              });
                            }}
                          />
                        </div>
                      {:else if provider.transport.kind === "api"}
                        <div class="flex items-center gap-2">
                          <span class="w-20 text-xs text-muted-foreground"
                            >Base URL</span
                          >
                          <Input
                            type="text"
                            value={provider.transport.base_url}
                            class="flex-1"
                            disabled={ai_settings_disabled}
                            oninput={(
                              e: Event & { currentTarget: HTMLInputElement },
                            ) => {
                              const t: AiTransport = {
                                kind: "api",
                                base_url: e.currentTarget.value,
                              };
                              const key =
                                provider.transport.kind === "api"
                                  ? provider.transport.api_key_env
                                  : undefined;
                              if (key) t.api_key_env = key;
                              update_provider(provider.id, { transport: t });
                            }}
                          />
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="w-20 text-xs text-muted-foreground"
                            >API Key Env</span
                          >
                          <Input
                            type="text"
                            value={provider.transport.api_key_env ?? ""}
                            class="flex-1"
                            placeholder="e.g. OPENAI_API_KEY"
                            disabled={ai_settings_disabled}
                            oninput={(
                              e: Event & { currentTarget: HTMLInputElement },
                            ) => {
                              const t: AiTransport = {
                                kind: "api",
                                base_url:
                                  provider.transport.kind === "api"
                                    ? provider.transport.base_url
                                    : "",
                              };
                              const key = e.currentTarget.value;
                              if (key) t.api_key_env = key;
                              update_provider(provider.id, { transport: t });
                            }}
                          />
                        </div>
                      {/if}
                      <div class="flex items-center gap-2">
                        <span class="w-20 text-xs text-muted-foreground"
                          >Model</span
                        >
                        <Input
                          type="text"
                          value={provider.model ?? ""}
                          class="flex-1"
                          placeholder="Optional"
                          disabled={ai_settings_disabled}
                          oninput={(
                            e: Event & { currentTarget: HTMLInputElement },
                          ) =>
                            update_provider(provider.id, {
                              model: e.currentTarget.value || undefined,
                            })}
                        />
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="w-20 text-xs text-muted-foreground"
                          >Install URL</span
                        >
                        <Input
                          type="text"
                          value={provider.install_url ?? ""}
                          class="flex-1"
                          placeholder="Optional"
                          disabled={ai_settings_disabled}
                          oninput={(
                            e: Event & { currentTarget: HTMLInputElement },
                          ) =>
                            update_provider(provider.id, {
                              install_url: e.currentTarget.value || undefined,
                            })}
                        />
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}

              {#if new_provider}
                <div class="rounded-md border border-dashed p-3 space-y-2">
                  <div class="flex items-center gap-2">
                    <span class="w-20 text-xs text-muted-foreground">ID</span>
                    <Input
                      type="text"
                      bind:value={new_provider.id}
                      class="flex-1"
                      placeholder="unique-id"
                      disabled={ai_settings_disabled}
                    />
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-20 text-xs text-muted-foreground">Name</span>
                    <Input
                      type="text"
                      bind:value={new_provider.name}
                      class="flex-1"
                      placeholder="My Provider"
                      disabled={ai_settings_disabled}
                    />
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-20 text-xs text-muted-foreground"
                      >Transport</span
                    >
                    <Select.Root
                      type="single"
                      value={new_provider.transport_kind}
                      disabled={ai_settings_disabled}
                      onValueChange={(v: string | undefined) => {
                        if (v && new_provider)
                          new_provider.transport_kind = v as "cli" | "api";
                      }}
                    >
                      <Select.Trigger class="flex-1">
                        <span data-slot="select-value"
                          >{transport_kind_options.find(
                            (o) => o.value === new_provider!.transport_kind,
                          )?.label ?? new_provider!.transport_kind}</span
                        >
                      </Select.Trigger>
                      <Select.Content>
                        {#each transport_kind_options as opt (opt.value)}
                          <Select.Item value={opt.value}
                            >{opt.label}</Select.Item
                          >
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </div>
                  {#if new_provider.transport_kind === "cli"}
                    <div class="flex items-center gap-2">
                      <span class="w-20 text-xs text-muted-foreground"
                        >Command</span
                      >
                      <Input
                        type="text"
                        bind:value={new_provider.command}
                        class="flex-1"
                        placeholder="/absolute/path/to/binary"
                        disabled={ai_settings_disabled}
                      />
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="w-20 text-xs text-muted-foreground"
                        >Args</span
                      >
                      <Input
                        type="text"
                        bind:value={new_provider.args}
                        class="flex-1 font-mono text-xs"
                        placeholder="chat {'{' + 'model}'}"
                        disabled={ai_settings_disabled}
                      />
                    </div>
                  {:else}
                    <div class="flex items-center gap-2">
                      <span class="w-20 text-xs text-muted-foreground"
                        >Base URL</span
                      >
                      <Input
                        type="text"
                        bind:value={new_provider.base_url}
                        class="flex-1"
                        placeholder="https://api.openai.com/v1"
                        disabled={ai_settings_disabled}
                      />
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="w-20 text-xs text-muted-foreground"
                        >API Key Env</span
                      >
                      <Input
                        type="text"
                        bind:value={new_provider.api_key_env}
                        class="flex-1"
                        placeholder="OPENAI_API_KEY"
                        disabled={ai_settings_disabled}
                      />
                    </div>
                  {/if}
                  <div class="flex items-center gap-2">
                    <span class="w-20 text-xs text-muted-foreground">Model</span
                    >
                    <Input
                      type="text"
                      bind:value={new_provider.model}
                      class="flex-1"
                      placeholder="Optional"
                      disabled={ai_settings_disabled}
                    />
                  </div>
                  <div class="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => (new_provider = null)}>Cancel</Button
                    >
                    <Button
                      size="sm"
                      onclick={add_provider}
                      disabled={!new_provider.id.trim() ||
                        !new_provider.name.trim() ||
                        (new_provider.transport_kind === "cli"
                          ? !new_provider.command.trim()
                          : !new_provider.base_url.trim())}>Add</Button
                    >
                  </div>
                </div>
              {:else}
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() =>
                    (new_provider = {
                      id: "",
                      name: "",
                      transport_kind: "cli",
                      command: "",
                      args: "",
                      base_url: "",
                      api_key_env: "",
                      model: "",
                    })}
                  disabled={ai_settings_disabled}
                >
                  Add Provider
                </Button>
              {/if}
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Execution Timeout</span>
                <span class="SettingsDialog__description"
                  >Maximum time to wait for an AI CLI response</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={String(editor_settings.ai_execution_timeout_seconds)}
                  onValueChange={(v: string | undefined) => {
                    if (v) update("ai_execution_timeout_seconds", Number(v));
                  }}
                  disabled={ai_settings_disabled}
                >
                  <Select.Trigger class="w-28">
                    <span data-slot="select-value">
                      {ai_timeout_options.find(
                        (o) =>
                          o.value ===
                          String(editor_settings.ai_execution_timeout_seconds),
                      )?.label ??
                        `${String(editor_settings.ai_execution_timeout_seconds)} sec`}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each ai_timeout_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "ai_execution_timeout_seconds",
                      DEFAULT_EDITOR_SETTINGS.ai_execution_timeout_seconds,
                    )}
                  disabled={ai_settings_disabled ||
                    editor_settings.ai_execution_timeout_seconds ===
                      DEFAULT_EDITOR_SETTINGS.ai_execution_timeout_seconds}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.ai_execution_timeout_seconds)} sec)`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
          </div>
        {:else if active_category === "layout"}
          <h2 class="SettingsDialog__content-header">Layout</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Editor Max Width</span>
                <span class="SettingsDialog__description"
                  >Maximum line width for the editor content (in characters)</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.editor_max_width_ch}
                  onValueChange={(v: number | undefined) => {
                    if (v !== undefined) {
                      update("editor_max_width_ch", v);
                    }
                  }}
                  min={60}
                  max={140}
                  step={5}
                  class="w-32"
                />
                <span class="text-sm tabular-nums w-10"
                  >{editor_settings.editor_max_width_ch}ch</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "editor_max_width_ch",
                      DEFAULT_EDITOR_SETTINGS.editor_max_width_ch,
                    )}
                  disabled={editor_settings.editor_max_width_ch ===
                    DEFAULT_EDITOR_SETTINGS.editor_max_width_ch}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.editor_max_width_ch)}ch)`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Max Open Tabs</span>
                <span class="SettingsDialog__description"
                  >Limit the number of tabs for better performance</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={String(editor_settings.max_open_tabs)}
                  onValueChange={(v: string | undefined) => {
                    if (v) update("max_open_tabs", Number(v));
                  }}
                >
                  <Select.Trigger class="w-20">
                    <span data-slot="select-value"
                      >{editor_settings.max_open_tabs}</span
                    >
                  </Select.Trigger>
                  <Select.Content>
                    {#each tab_count_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "max_open_tabs",
                      DEFAULT_EDITOR_SETTINGS.max_open_tabs,
                    )}
                  disabled={editor_settings.max_open_tabs ===
                    DEFAULT_EDITOR_SETTINGS.max_open_tabs}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.max_open_tabs)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Outline Position</span>
                <span class="SettingsDialog__description"
                  >Show outline as a floating panel over the editor or in the
                  sidebar rail</span
                >
              </div>
              <Select.Root
                type="single"
                value={editor_settings.outline_mode}
                onValueChange={(v: string | undefined) => {
                  if (v) update("outline_mode", v as OutlineMode);
                }}
              >
                <Select.Trigger class="w-28">
                  <span data-slot="select-value"
                    >{editor_settings.outline_mode === "floating"
                      ? "Floating"
                      : "Sidebar"}</span
                  >
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="rail">Sidebar</Select.Item>
                  <Select.Item value="floating">Floating</Select.Item>
                </Select.Content>
              </Select.Root>
            </div>

            <div class="SettingsDialog__row">
              <div>
                <span class="SettingsDialog__label">File Tree Style</span>
                <span class="SettingsDialog__description"
                  >Visual style for the sidebar file explorer</span
                >
              </div>
              <Select.Root
                type="single"
                value={editor_settings.file_tree_style}
                onValueChange={(v: string | undefined) => {
                  if (v) update("file_tree_style", v as FileTreeStyle);
                }}
              >
                <Select.Trigger class="w-40">
                  <span data-slot="select-value"
                    >{{
                      default: "Default",
                      airy_minimal: "Airy Minimal",
                      compact: "Compact",
                      macos_finder: "macOS Finder",
                      refined: "Refined",
                    }[editor_settings.file_tree_style]}</span
                  >
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="default">Default</Select.Item>
                  <Select.Item value="airy_minimal">Airy Minimal</Select.Item>
                  <Select.Item value="compact">Compact</Select.Item>
                  <Select.Item value="macos_finder">macOS Finder</Select.Item>
                  <Select.Item value="refined">Refined</Select.Item>
                </Select.Content>
              </Select.Root>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Show File Blurb</span>
                <span class="SettingsDialog__description"
                  >Display a secondary line with a note description or preview</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.file_tree_show_blurb}
                onCheckedChange={(v: boolean) => {
                  update("file_tree_show_blurb", v);
                }}
              />
            </div>

            {#if editor_settings.file_tree_show_blurb}
              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Blurb Position</span>
                  <span class="SettingsDialog__description"
                    >Whether the blurb is a caption below or heading above the
                    filename</span
                  >
                </div>
                <Select.Root
                  type="single"
                  value={editor_settings.file_tree_blurb_position}
                  onValueChange={(v: string | undefined) => {
                    if (v)
                      update(
                        "file_tree_blurb_position",
                        v as FileTreeBlurbPosition,
                      );
                  }}
                >
                  <Select.Trigger class="w-28">
                    <span data-slot="select-value"
                      >{{
                        caption: "Caption",
                        heading: "Heading",
                      }[editor_settings.file_tree_blurb_position]}</span
                    >
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="caption">Caption</Select.Item>
                    <Select.Item value="heading">Heading</Select.Item>
                  </Select.Content>
                </Select.Root>
              </div>
            {/if}

            <div class="space-y-4 border-t pt-4">
              <div
                class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Reading
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Heading Spacing</span>
                  <span class="SettingsDialog__description"
                    >Adjust vertical spacing around headings</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={editor_settings.editor_heading_spacing_density}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update(
                          "editor_heading_spacing_density",
                          v as EditorSpacingDensity,
                        );
                    }}
                  >
                    <Select.Trigger class="w-28">
                      <span data-slot="select-value">
                        {density_options.find(
                          (o) =>
                            o.value ===
                            editor_settings.editor_heading_spacing_density,
                        )?.label ?? "Normal"}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each density_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_heading_spacing_density",
                        DEFAULT_EDITOR_SETTINGS.editor_heading_spacing_density,
                      )}
                    disabled={editor_settings.editor_heading_spacing_density ===
                      DEFAULT_EDITOR_SETTINGS.editor_heading_spacing_density}
                    title="Reset to default (Normal)"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Heading Markers</span>
                  <span class="SettingsDialog__description"
                    >Show heading level markers (e.g. ##) in the visual editor</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Switch.Root
                    checked={editor_settings.editor_heading_markers}
                    onCheckedChange={(v: boolean) =>
                      update("editor_heading_markers", v)}
                  />
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Paragraph Spacing</span>
                  <span class="SettingsDialog__description"
                    >Adjust vertical spacing between paragraphs</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={editor_settings.editor_paragraph_spacing_density}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update(
                          "editor_paragraph_spacing_density",
                          v as EditorSpacingDensity,
                        );
                    }}
                  >
                    <Select.Trigger class="w-28">
                      <span data-slot="select-value">
                        {density_options.find(
                          (o) =>
                            o.value ===
                            editor_settings.editor_paragraph_spacing_density,
                        )?.label ?? "Normal"}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each density_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_paragraph_spacing_density",
                        DEFAULT_EDITOR_SETTINGS.editor_paragraph_spacing_density,
                      )}
                    disabled={editor_settings.editor_paragraph_spacing_density ===
                      DEFAULT_EDITOR_SETTINGS.editor_paragraph_spacing_density}
                    title="Reset to default (Normal)"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">List Spacing</span>
                  <span class="SettingsDialog__description"
                    >Adjust spacing inside and around lists</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={editor_settings.editor_list_spacing_density}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update(
                          "editor_list_spacing_density",
                          v as EditorSpacingDensity,
                        );
                    }}
                  >
                    <Select.Trigger class="w-28">
                      <span data-slot="select-value">
                        {density_options.find(
                          (o) =>
                            o.value ===
                            editor_settings.editor_list_spacing_density,
                        )?.label ?? "Normal"}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each density_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_list_spacing_density",
                        DEFAULT_EDITOR_SETTINGS.editor_list_spacing_density,
                      )}
                    disabled={editor_settings.editor_list_spacing_density ===
                      DEFAULT_EDITOR_SETTINGS.editor_list_spacing_density}
                    title="Reset to default (Normal)"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Table Spacing</span>
                  <span class="SettingsDialog__description"
                    >Adjust cell padding and density in tables</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={editor_settings.editor_table_spacing_density}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update(
                          "editor_table_spacing_density",
                          v as EditorSpacingDensity,
                        );
                    }}
                  >
                    <Select.Trigger class="w-28">
                      <span data-slot="select-value">
                        {density_options.find(
                          (o) =>
                            o.value ===
                            editor_settings.editor_table_spacing_density,
                        )?.label ?? "Normal"}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each density_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_table_spacing_density",
                        DEFAULT_EDITOR_SETTINGS.editor_table_spacing_density,
                      )}
                    disabled={editor_settings.editor_table_spacing_density ===
                      DEFAULT_EDITOR_SETTINGS.editor_table_spacing_density}
                    title="Reset to default (Normal)"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Selection Color</span>
                  <span class="SettingsDialog__description"
                    >Optional CSS color override for text selection</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Input
                    type="text"
                    value={editor_settings.editor_selection_color}
                    oninput={(
                      e: Event & { currentTarget: HTMLInputElement },
                    ) => {
                      update("editor_selection_color", e.currentTarget.value);
                    }}
                    class="w-48"
                    placeholder="Theme default"
                  />
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_selection_color",
                        DEFAULT_EDITOR_SETTINGS.editor_selection_color,
                      )}
                    disabled={editor_settings.editor_selection_color ===
                      DEFAULT_EDITOR_SETTINGS.editor_selection_color}
                    title="Reset to theme default"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>
            </div>

            <div class="space-y-4 border-t pt-4">
              <div
                class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Blocks
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Code Block Padding</span>
                  <span class="SettingsDialog__description"
                    >Adjust padding inside code blocks</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={editor_settings.editor_code_block_padding}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update(
                          "editor_code_block_padding",
                          v as EditorCodeBlockPadding,
                        );
                    }}
                  >
                    <Select.Trigger class="w-28">
                      <span data-slot="select-value">
                        {density_options.find(
                          (o) =>
                            o.value ===
                            editor_settings.editor_code_block_padding,
                        )?.label ?? "Normal"}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each density_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_code_block_padding",
                        DEFAULT_EDITOR_SETTINGS.editor_code_block_padding,
                      )}
                    disabled={editor_settings.editor_code_block_padding ===
                      DEFAULT_EDITOR_SETTINGS.editor_code_block_padding}
                    title="Reset to default (Normal)"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Code Block Radius</span>
                  <span class="SettingsDialog__description"
                    >Adjust code block corner roundness</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={editor_settings.editor_code_block_radius}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update(
                          "editor_code_block_radius",
                          v as EditorCodeBlockRadius,
                        );
                    }}
                  >
                    <Select.Trigger class="w-28">
                      <span data-slot="select-value">
                        {code_block_radius_options.find(
                          (o) =>
                            o.value ===
                            editor_settings.editor_code_block_radius,
                        )?.label ?? "Normal"}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each code_block_radius_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_code_block_radius",
                        DEFAULT_EDITOR_SETTINGS.editor_code_block_radius,
                      )}
                    disabled={editor_settings.editor_code_block_radius ===
                      DEFAULT_EDITOR_SETTINGS.editor_code_block_radius}
                    title="Reset to default (Normal)"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Code Block Wrap</span>
                  <span class="SettingsDialog__description"
                    >Wrap long lines instead of horizontal scroll</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Switch.Root
                    checked={editor_settings.editor_code_block_wrap}
                    onCheckedChange={(v: boolean) =>
                      update("editor_code_block_wrap", v)}
                  />
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label"
                    >Source Editor Line Numbers</span
                  >
                  <span class="SettingsDialog__description"
                    >Show line numbers in the source editor gutter</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Switch.Root
                    checked={editor_settings.source_editor_line_numbers}
                    onCheckedChange={(v: boolean) =>
                      update("source_editor_line_numbers", v)}
                  />
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Spell Check</span>
                  <span class="SettingsDialog__description"
                    >Enable browser-native spell checking in the editor</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Switch.Root
                    checked={editor_settings.editor_spellcheck}
                    onCheckedChange={(v: boolean) =>
                      update("editor_spellcheck", v)}
                  />
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Blockquote Padding</span>
                  <span class="SettingsDialog__description"
                    >Adjust padding inside blockquotes</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={editor_settings.editor_blockquote_padding}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update(
                          "editor_blockquote_padding",
                          v as EditorBlockquotePadding,
                        );
                    }}
                  >
                    <Select.Trigger class="w-28">
                      <span data-slot="select-value">
                        {density_options.find(
                          (o) =>
                            o.value ===
                            editor_settings.editor_blockquote_padding,
                        )?.label ?? "Normal"}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each density_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_blockquote_padding",
                        DEFAULT_EDITOR_SETTINGS.editor_blockquote_padding,
                      )}
                    disabled={editor_settings.editor_blockquote_padding ===
                      DEFAULT_EDITOR_SETTINGS.editor_blockquote_padding}
                    title="Reset to default (Normal)"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label"
                    >Blockquote Border Width</span
                  >
                  <span class="SettingsDialog__description"
                    >Adjust the thickness of the blockquote border</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={String(
                      editor_settings.editor_blockquote_border_width,
                    )}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update(
                          "editor_blockquote_border_width",
                          Number(v) as 2 | 3 | 4,
                        );
                    }}
                  >
                    <Select.Trigger class="w-28">
                      <span data-slot="select-value">
                        {blockquote_border_width_options.find(
                          (o) =>
                            o.value ===
                            String(
                              editor_settings.editor_blockquote_border_width,
                            ),
                        )?.label ?? "2 px"}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each blockquote_border_width_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_blockquote_border_width",
                        DEFAULT_EDITOR_SETTINGS.editor_blockquote_border_width,
                      )}
                    disabled={editor_settings.editor_blockquote_border_width ===
                      DEFAULT_EDITOR_SETTINGS.editor_blockquote_border_width}
                    title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.editor_blockquote_border_width)} px)`}
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>
            </div>

            <div class="space-y-4 border-t pt-4">
              <div
                class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Links
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Underline Style</span>
                  <span class="SettingsDialog__description"
                    >Choose how links are underlined in the editor</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={editor_settings.editor_link_underline_style}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update(
                          "editor_link_underline_style",
                          v as EditorLinkUnderlineStyle,
                        );
                    }}
                  >
                    <Select.Trigger class="w-28">
                      <span data-slot="select-value">
                        {link_underline_style_options.find(
                          (o) =>
                            o.value ===
                            editor_settings.editor_link_underline_style,
                        )?.label ?? "Solid"}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each link_underline_style_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_link_underline_style",
                        DEFAULT_EDITOR_SETTINGS.editor_link_underline_style,
                      )}
                    disabled={editor_settings.editor_link_underline_style ===
                      DEFAULT_EDITOR_SETTINGS.editor_link_underline_style}
                    title="Reset to default (Solid)"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>
            </div>

            <div class="space-y-4 border-t pt-4">
              <div
                class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Dividers
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Divider Style</span>
                  <span class="SettingsDialog__description"
                    >Choose how horizontal rules are displayed</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={editor_settings.editor_divider_style}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update("editor_divider_style", v as EditorDividerStyle);
                    }}
                  >
                    <Select.Trigger class="w-28">
                      <span data-slot="select-value">
                        {divider_style_options.find(
                          (o) =>
                            o.value === editor_settings.editor_divider_style,
                        )?.label ?? "Gradient"}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each divider_style_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_divider_style",
                        DEFAULT_EDITOR_SETTINGS.editor_divider_style,
                      )}
                    disabled={editor_settings.editor_divider_style ===
                      DEFAULT_EDITOR_SETTINGS.editor_divider_style}
                    title="Reset to default (Gradient)"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Thickness</span>
                  <span class="SettingsDialog__description"
                    >Line thickness in pixels</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Slider
                    type="single"
                    value={editor_settings.editor_divider_thickness_px}
                    onValueChange={(v: number | undefined) => {
                      if (v !== undefined) {
                        update("editor_divider_thickness_px", v);
                      }
                    }}
                    min={1}
                    max={5}
                    step={1}
                    class="w-24"
                  />
                  <span class="text-sm tabular-nums w-8"
                    >{editor_settings.editor_divider_thickness_px}px</span
                  >
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_divider_thickness_px",
                        DEFAULT_EDITOR_SETTINGS.editor_divider_thickness_px,
                      )}
                    disabled={editor_settings.editor_divider_thickness_px ===
                      DEFAULT_EDITOR_SETTINGS.editor_divider_thickness_px}
                    title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.editor_divider_thickness_px)}px)`}
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Color</span>
                  <span class="SettingsDialog__description"
                    >Custom color (leave empty for theme default)</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Input
                    type="text"
                    value={editor_settings.editor_divider_color}
                    oninput={(
                      e: Event & { currentTarget: HTMLInputElement },
                    ) => {
                      update("editor_divider_color", e.currentTarget.value);
                    }}
                    class="w-36"
                    placeholder="e.g. #888"
                  />
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_divider_color",
                        DEFAULT_EDITOR_SETTINGS.editor_divider_color,
                      )}
                    disabled={editor_settings.editor_divider_color ===
                      DEFAULT_EDITOR_SETTINGS.editor_divider_color}
                    title="Reset to theme default"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Spacing</span>
                  <span class="SettingsDialog__description"
                    >Vertical spacing above and below dividers</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={editor_settings.editor_divider_spacing}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update(
                          "editor_divider_spacing",
                          v as EditorSpacingDensity,
                        );
                    }}
                  >
                    <Select.Trigger class="w-28">
                      <span data-slot="select-value">
                        {density_options.find(
                          (o) =>
                            o.value === editor_settings.editor_divider_spacing,
                        )?.label ?? "Normal"}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each density_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "editor_divider_spacing",
                        DEFAULT_EDITOR_SETTINGS.editor_divider_spacing,
                      )}
                    disabled={editor_settings.editor_divider_spacing ===
                      DEFAULT_EDITOR_SETTINGS.editor_divider_spacing}
                    title="Reset to default (Normal)"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>
            </div>
          </div>
        {:else if active_category === "files"}
          <h2 class="SettingsDialog__content-header">Files</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Default Note Name</span>
                <span class="SettingsDialog__description">
                  Template using strftime tokens: %Y (year), %m (month), %d
                  (day), %H (hour), %M (minute), %S (second). Leave empty for
                  Untitled-N.
                </span>
              </div>
              <div class="flex items-center gap-3">
                <Input
                  type="text"
                  value={editor_settings.default_note_name_template}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                    update("default_note_name_template", e.currentTarget.value);
                  }}
                  class="w-48"
                  placeholder="e.g. %Y-%m-%d"
                />
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "default_note_name_template",
                      DEFAULT_EDITOR_SETTINGS.default_note_name_template,
                    )}
                  disabled={editor_settings.default_note_name_template ===
                    DEFAULT_EDITOR_SETTINGS.default_note_name_template}
                  title="Reset to default (empty = Untitled-N)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
            <div class="SettingsDialog__row">
              <span class="SettingsDialog__label">Attachment Folder</span>
              <Input
                type="text"
                value={editor_settings.attachment_folder}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                  update("attachment_folder", e.currentTarget.value);
                }}
                class="w-48"
                placeholder=".assets"
              />
            </div>
            <div class="SettingsDialog__row SettingsDialog__row--top-aligned">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Ignored Folders</span>
                <span class="SettingsDialog__description">
                  One vault-relative folder per line. These are combined with
                  <code>.vaultignore</code> and <code>.gitignore</code>.
                </span>
              </div>
              <IgnoredFoldersInput
                value={editor_settings.ignored_folders}
                {folder_paths}
                on_change={(value) => {
                  update("ignored_folders", value);
                }}
              />
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Show Hidden Files</span>
                <span class="SettingsDialog__description"
                  >Show dot-prefixed files and folders in the file tree</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.show_hidden_files}
                onCheckedChange={(v: boolean) => {
                  update("show_hidden_files", v);
                }}
              />
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Autosave</span>
                <span class="SettingsDialog__description"
                  >Automatically save Markdown notes after edits</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.autosave_enabled}
                onCheckedChange={(v: boolean) => {
                  update("autosave_enabled", v);
                }}
              />
            </div>
            {#if editor_settings.autosave_enabled}
              <div class="SettingsDialog__row" transition:slide>
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Autosave Delay (ms)</span>
                  <span class="SettingsDialog__description"
                    >Delay before automatically saving after edits</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Slider
                    type="single"
                    value={editor_settings.autosave_delay_ms}
                    onValueChange={(v: number | undefined) => {
                      if (v !== undefined) {
                        update("autosave_delay_ms", v);
                      }
                    }}
                    min={500}
                    max={10000}
                    step={100}
                    class="w-32"
                  />
                  <span class="text-sm tabular-nums w-14"
                    >{editor_settings.autosave_delay_ms}ms</span
                  >
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "autosave_delay_ms",
                        DEFAULT_EDITOR_SETTINGS.autosave_delay_ms,
                      )}
                    disabled={editor_settings.autosave_delay_ms ===
                      DEFAULT_EDITOR_SETTINGS.autosave_delay_ms}
                    title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.autosave_delay_ms)}ms)`}
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {:else if active_category === "git"}
          <h2 class="SettingsDialog__content-header">Git</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Origin Remote URL</span>
                <span class="SettingsDialog__description">
                  {git_enabled
                    ? "Set or update the origin remote for the active vault"
                    : "Initialize Git for this vault before configuring a remote"}
                </span>
              </div>
              <div class="flex items-center gap-3">
                <Input
                  type="text"
                  value={git_remote_url}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                    on_git_remote_url_change(e.currentTarget.value);
                  }}
                  class="w-72"
                  placeholder="git@github.com:owner/repo.git"
                />
              </div>
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Auto-commit Mode</span>
                <span class="SettingsDialog__description"
                  >When to automatically commit saved changes to Git</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={editor_settings.git_autocommit_mode}
                  onValueChange={(v: string | undefined) => {
                    if (v)
                      update("git_autocommit_mode", v as GitAutocommitMode);
                  }}
                >
                  <Select.Trigger class="w-36">
                    <span data-slot="select-value"
                      >{autocommit_mode_options.find(
                        (o) => o.value === editor_settings.git_autocommit_mode,
                      )?.label ?? "Off"}</span
                    >
                  </Select.Trigger>
                  <Select.Content>
                    {#each autocommit_mode_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "git_autocommit_mode",
                      DEFAULT_EDITOR_SETTINGS.git_autocommit_mode,
                    )}
                  disabled={editor_settings.git_autocommit_mode ===
                    DEFAULT_EDITOR_SETTINGS.git_autocommit_mode}
                  title="Reset to default (Off)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
            {#if editor_settings.git_autocommit_mode === "interval"}
              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Auto-commit Interval</span
                  >
                  <span class="SettingsDialog__description"
                    >Minutes between automatic commits</span
                  >
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={String(
                      editor_settings.git_autocommit_interval_minutes,
                    )}
                    onValueChange={(v: string | undefined) => {
                      if (v)
                        update("git_autocommit_interval_minutes", Number(v));
                    }}
                  >
                    <Select.Trigger class="w-24">
                      <span data-slot="select-value"
                        >{editor_settings.git_autocommit_interval_minutes} min</span
                      >
                    </Select.Trigger>
                    <Select.Content>
                      {#each interval_options as opt (opt.value)}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "git_autocommit_interval_minutes",
                        DEFAULT_EDITOR_SETTINGS.git_autocommit_interval_minutes,
                      )}
                    disabled={editor_settings.git_autocommit_interval_minutes ===
                      DEFAULT_EDITOR_SETTINGS.git_autocommit_interval_minutes}
                    title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.git_autocommit_interval_minutes)} min)`}
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>
            {/if}
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Pull Strategy</span>
                <span class="SettingsDialog__description"
                  >How remote changes should be integrated on pull</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={editor_settings.git_pull_strategy}
                  onValueChange={(v: string | undefined) => {
                    if (v) update("git_pull_strategy", v as GitPullStrategy);
                  }}
                >
                  <Select.Trigger class="w-36">
                    <span data-slot="select-value">
                      {pull_strategy_options.find(
                        (o) => o.value === editor_settings.git_pull_strategy,
                      )?.label ?? "Merge"}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each pull_strategy_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "git_pull_strategy",
                      DEFAULT_EDITOR_SETTINGS.git_pull_strategy,
                    )}
                  disabled={editor_settings.git_pull_strategy ===
                    DEFAULT_EDITOR_SETTINGS.git_pull_strategy}
                  title="Reset to default (Merge)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Auto-fetch Interval</span>
                <span class="SettingsDialog__description"
                  >Refresh remote status periodically in the background</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={String(
                    editor_settings.git_auto_fetch_interval_minutes,
                  )}
                  onValueChange={(v: string | undefined) => {
                    if (v) update("git_auto_fetch_interval_minutes", Number(v));
                  }}
                >
                  <Select.Trigger class="w-28">
                    <span data-slot="select-value">
                      {auto_fetch_interval_options.find(
                        (o) =>
                          o.value ===
                          String(
                            editor_settings.git_auto_fetch_interval_minutes,
                          ),
                      )?.label ?? "Off"}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each auto_fetch_interval_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "git_auto_fetch_interval_minutes",
                      DEFAULT_EDITOR_SETTINGS.git_auto_fetch_interval_minutes,
                    )}
                  disabled={editor_settings.git_auto_fetch_interval_minutes ===
                    DEFAULT_EDITOR_SETTINGS.git_auto_fetch_interval_minutes}
                  title="Reset to default (Off)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
          </div>
        {:else if active_category === "documents"}
          <h2 class="SettingsDialog__content-header">Documents</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">PDF Default Zoom</span>
                <span class="SettingsDialog__description"
                  >Initial zoom mode when opening PDFs</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={editor_settings.document_pdf_default_zoom}
                  onValueChange={(v: string | undefined) => {
                    if (v)
                      update(
                        "document_pdf_default_zoom",
                        v as DocumentPdfZoomMode,
                      );
                  }}
                >
                  <Select.Trigger class="w-32">
                    <span data-slot="select-value">
                      {pdf_zoom_options.find(
                        (o) =>
                          o.value === editor_settings.document_pdf_default_zoom,
                      )?.label ?? "Actual Size"}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each pdf_zoom_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "document_pdf_default_zoom",
                      DEFAULT_EDITOR_SETTINGS.document_pdf_default_zoom,
                    )}
                  disabled={editor_settings.document_pdf_default_zoom ===
                    DEFAULT_EDITOR_SETTINGS.document_pdf_default_zoom}
                  title="Reset to default (Actual Size)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">PDF Scroll Mode</span>
                <span class="SettingsDialog__description"
                  >Continuous scrolling or single-page navigation</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={editor_settings.document_pdf_scroll_mode}
                  onValueChange={(v: string | undefined) => {
                    if (v)
                      update(
                        "document_pdf_scroll_mode",
                        v as DocumentPdfScrollMode,
                      );
                  }}
                >
                  <Select.Trigger class="w-32">
                    <span data-slot="select-value">
                      {pdf_scroll_mode_options.find(
                        (o) =>
                          o.value === editor_settings.document_pdf_scroll_mode,
                      )?.label ?? "Continuous"}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each pdf_scroll_mode_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "document_pdf_scroll_mode",
                      DEFAULT_EDITOR_SETTINGS.document_pdf_scroll_mode,
                    )}
                  disabled={editor_settings.document_pdf_scroll_mode ===
                    DEFAULT_EDITOR_SETTINGS.document_pdf_scroll_mode}
                  title="Reset to default (Continuous)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Wrap Code/Text</span>
                <span class="SettingsDialog__description"
                  >Wrap long lines in code and plain-text viewers</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.document_code_wrap}
                onCheckedChange={(v: boolean) => {
                  update("document_code_wrap", v);
                }}
              />
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Image Background</span>
                <span class="SettingsDialog__description"
                  >Background style behind images in the document viewer</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={editor_settings.document_image_background}
                  onValueChange={(v: string | undefined) => {
                    if (v)
                      update(
                        "document_image_background",
                        v as DocumentImageBackground,
                      );
                  }}
                >
                  <Select.Trigger class="w-36">
                    <span data-slot="select-value">
                      {image_background_options.find(
                        (o) =>
                          o.value === editor_settings.document_image_background,
                      )?.label ?? "Checkerboard"}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each image_background_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "document_image_background",
                      DEFAULT_EDITOR_SETTINGS.document_image_background,
                    )}
                  disabled={editor_settings.document_image_background ===
                    DEFAULT_EDITOR_SETTINGS.document_image_background}
                  title="Reset to default (Checkerboard)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Inactive Cache Limit</span>
                <span class="SettingsDialog__description"
                  >How many inactive documents keep their payload cached</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={String(editor_settings.document_inactive_cache_limit)}
                  onValueChange={(v: string | undefined) => {
                    if (v) update("document_inactive_cache_limit", Number(v));
                  }}
                >
                  <Select.Trigger class="w-36">
                    <span data-slot="select-value">
                      {document_cache_limit_options.find(
                        (o) =>
                          o.value ===
                          String(editor_settings.document_inactive_cache_limit),
                      )?.label ??
                        `${String(editor_settings.document_inactive_cache_limit)} documents`}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each document_cache_limit_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "document_inactive_cache_limit",
                      DEFAULT_EDITOR_SETTINGS.document_inactive_cache_limit,
                    )}
                  disabled={editor_settings.document_inactive_cache_limit ===
                    DEFAULT_EDITOR_SETTINGS.document_inactive_cache_limit}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.document_inactive_cache_limit)} documents)`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
          </div>
        {:else if active_category === "terminal"}
          <h2 class="SettingsDialog__content-header">Terminal</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Shell Path</span>
                <span class="SettingsDialog__description"
                  >Path to the shell executable used by the terminal</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Input
                  type="text"
                  value={editor_settings.terminal_shell_path}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                    update("terminal_shell_path", e.currentTarget.value);
                  }}
                  class="w-48"
                  placeholder="/bin/zsh"
                />
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "terminal_shell_path",
                      DEFAULT_EDITOR_SETTINGS.terminal_shell_path,
                    )}
                  disabled={editor_settings.terminal_shell_path ===
                    DEFAULT_EDITOR_SETTINGS.terminal_shell_path}
                  title={`Reset to default (${DEFAULT_EDITOR_SETTINGS.terminal_shell_path})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Font Size</span>
                <span class="SettingsDialog__description"
                  >Text size used by the embedded terminal</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={String(editor_settings.terminal_font_size_px)}
                  onValueChange={(v: string | undefined) => {
                    if (v) update("terminal_font_size_px", Number(v));
                  }}
                >
                  <Select.Trigger class="w-24">
                    <span data-slot="select-value"
                      >{editor_settings.terminal_font_size_px} px</span
                    >
                  </Select.Trigger>
                  <Select.Content>
                    {#each terminal_font_size_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "terminal_font_size_px",
                      DEFAULT_EDITOR_SETTINGS.terminal_font_size_px,
                    )}
                  disabled={editor_settings.terminal_font_size_px ===
                    DEFAULT_EDITOR_SETTINGS.terminal_font_size_px}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.terminal_font_size_px)} px)`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Cursor Blink</span>
                <span class="SettingsDialog__description"
                  >Animate the terminal cursor while focused</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.terminal_cursor_blink}
                onCheckedChange={(v: boolean) => {
                  update("terminal_cursor_blink", v);
                }}
              />
            </div>
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Follow Active Vault</span>
                <span class="SettingsDialog__description"
                  >Respawn the terminal in the active vault when switching
                  vaults</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.terminal_follow_active_vault}
                onCheckedChange={(v: boolean) => {
                  update("terminal_follow_active_vault", v);
                }}
              />
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Background Color</span>
                <span class="SettingsDialog__description"
                  >Custom terminal background color (empty = theme default)</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Input
                  type="text"
                  value={editor_settings.terminal_background_color}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                    update("terminal_background_color", e.currentTarget.value);
                  }}
                  class="w-36"
                  placeholder="e.g. #1e1e2e"
                />
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "terminal_background_color",
                      DEFAULT_EDITOR_SETTINGS.terminal_background_color,
                    )}
                  disabled={editor_settings.terminal_background_color ===
                    DEFAULT_EDITOR_SETTINGS.terminal_background_color}
                  title="Reset to theme default"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Font Color</span>
                <span class="SettingsDialog__description"
                  >Custom terminal text color (empty = theme default)</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Input
                  type="text"
                  value={editor_settings.terminal_foreground_color}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                    update("terminal_foreground_color", e.currentTarget.value);
                  }}
                  class="w-36"
                  placeholder="e.g. #cdd6f4"
                />
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "terminal_foreground_color",
                      DEFAULT_EDITOR_SETTINGS.terminal_foreground_color,
                    )}
                  disabled={editor_settings.terminal_foreground_color ===
                    DEFAULT_EDITOR_SETTINGS.terminal_foreground_color}
                  title="Reset to theme default"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Font Family</span>
                <span class="SettingsDialog__description"
                  >Custom font family (empty = system monospace)</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Input
                  type="text"
                  value={editor_settings.terminal_font_family}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                    update("terminal_font_family", e.currentTarget.value);
                  }}
                  class="w-48"
                  placeholder="e.g. Fira Code, monospace"
                />
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "terminal_font_family",
                      DEFAULT_EDITOR_SETTINGS.terminal_font_family,
                    )}
                  disabled={editor_settings.terminal_font_family ===
                    DEFAULT_EDITOR_SETTINGS.terminal_font_family}
                  title="Reset to default (system monospace)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Font Weight</span>
                <span class="SettingsDialog__description"
                  >Weight for normal terminal text</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={editor_settings.terminal_font_weight}
                  onValueChange={(v: string | undefined) => {
                    if (v)
                      update("terminal_font_weight", v as TerminalFontWeight);
                  }}
                >
                  <Select.Trigger class="w-28">
                    <span data-slot="select-value">
                      {terminal_font_weight_options.find(
                        (o) => o.value === editor_settings.terminal_font_weight,
                      )?.label ?? "Normal"}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each terminal_font_weight_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "terminal_font_weight",
                      DEFAULT_EDITOR_SETTINGS.terminal_font_weight,
                    )}
                  disabled={editor_settings.terminal_font_weight ===
                    DEFAULT_EDITOR_SETTINGS.terminal_font_weight}
                  title="Reset to default (Normal)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Bold Weight</span>
                <span class="SettingsDialog__description"
                  >Weight used for bold text in the terminal</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={editor_settings.terminal_font_weight_bold}
                  onValueChange={(v: string | undefined) => {
                    if (v)
                      update(
                        "terminal_font_weight_bold",
                        v as TerminalFontWeight,
                      );
                  }}
                >
                  <Select.Trigger class="w-28">
                    <span data-slot="select-value">
                      {terminal_font_weight_options.find(
                        (o) =>
                          o.value === editor_settings.terminal_font_weight_bold,
                      )?.label ?? "Bold"}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each terminal_font_weight_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "terminal_font_weight_bold",
                      DEFAULT_EDITOR_SETTINGS.terminal_font_weight_bold,
                    )}
                  disabled={editor_settings.terminal_font_weight_bold ===
                    DEFAULT_EDITOR_SETTINGS.terminal_font_weight_bold}
                  title="Reset to default (Bold)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Line Height</span>
                <span class="SettingsDialog__description"
                  >Line height multiplier for terminal text</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.terminal_line_height}
                  onValueChange={(v: number | undefined) => {
                    if (v !== undefined) {
                      update("terminal_line_height", Math.round(v * 10) / 10);
                    }
                  }}
                  min={1}
                  max={2}
                  step={0.1}
                  class="w-24"
                />
                <span class="text-sm tabular-nums w-8"
                  >{editor_settings.terminal_line_height.toFixed(1)}</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "terminal_line_height",
                      DEFAULT_EDITOR_SETTINGS.terminal_line_height,
                    )}
                  disabled={editor_settings.terminal_line_height ===
                    DEFAULT_EDITOR_SETTINGS.terminal_line_height}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.terminal_line_height)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Cursor Style</span>
                <span class="SettingsDialog__description"
                  >Shape of the terminal cursor</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={editor_settings.terminal_cursor_style}
                  onValueChange={(v: string | undefined) => {
                    if (v)
                      update("terminal_cursor_style", v as TerminalCursorStyle);
                  }}
                >
                  <Select.Trigger class="w-28">
                    <span data-slot="select-value">
                      {terminal_cursor_style_options.find(
                        (o) =>
                          o.value === editor_settings.terminal_cursor_style,
                      )?.label ?? "Block"}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each terminal_cursor_style_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "terminal_cursor_style",
                      DEFAULT_EDITOR_SETTINGS.terminal_cursor_style,
                    )}
                  disabled={editor_settings.terminal_cursor_style ===
                    DEFAULT_EDITOR_SETTINGS.terminal_cursor_style}
                  title="Reset to default (Block)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Scrollback Lines</span>
                <span class="SettingsDialog__description"
                  >Number of lines retained in the scrollback buffer</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={String(editor_settings.terminal_scrollback)}
                  onValueChange={(v: string | undefined) => {
                    if (v) update("terminal_scrollback", Number(v));
                  }}
                >
                  <Select.Trigger class="w-24">
                    <span data-slot="select-value">
                      {terminal_scrollback_options.find(
                        (o) =>
                          o.value ===
                          String(editor_settings.terminal_scrollback),
                      )?.label ?? String(editor_settings.terminal_scrollback)}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each terminal_scrollback_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "terminal_scrollback",
                      DEFAULT_EDITOR_SETTINGS.terminal_scrollback,
                    )}
                  disabled={editor_settings.terminal_scrollback ===
                    DEFAULT_EDITOR_SETTINGS.terminal_scrollback}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.terminal_scrollback)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
          </div>
        {:else if active_category === "graph"}
          <h2 class="SettingsDialog__content-header">Graph</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Link Distance</span>
                <span class="SettingsDialog__description"
                  >Target distance between connected nodes (higher = more
                  spread)</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.graph_force_link_distance}
                  onValueChange={(v: number | undefined) => {
                    if (v !== undefined) update("graph_force_link_distance", v);
                  }}
                  min={20}
                  max={300}
                  step={10}
                  class="w-32"
                />
                <span class="text-sm tabular-nums w-10"
                  >{editor_settings.graph_force_link_distance}</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "graph_force_link_distance",
                      DEFAULT_EDITOR_SETTINGS.graph_force_link_distance,
                    )}
                  disabled={editor_settings.graph_force_link_distance ===
                    DEFAULT_EDITOR_SETTINGS.graph_force_link_distance}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.graph_force_link_distance)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Repulsion Strength</span>
                <span class="SettingsDialog__description"
                  >How strongly nodes push apart (more negative = more
                  repulsion)</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.graph_force_charge_strength}
                  onValueChange={(v: number | undefined) => {
                    if (v !== undefined)
                      update("graph_force_charge_strength", v);
                  }}
                  min={-500}
                  max={-50}
                  step={10}
                  class="w-32"
                />
                <span class="text-sm tabular-nums w-10"
                  >{editor_settings.graph_force_charge_strength}</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "graph_force_charge_strength",
                      DEFAULT_EDITOR_SETTINGS.graph_force_charge_strength,
                    )}
                  disabled={editor_settings.graph_force_charge_strength ===
                    DEFAULT_EDITOR_SETTINGS.graph_force_charge_strength}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.graph_force_charge_strength)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Collision Radius</span>
                <span class="SettingsDialog__description"
                  >Minimum distance between node centers</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.graph_force_collision_radius}
                  onValueChange={(v: number | undefined) => {
                    if (v !== undefined)
                      update("graph_force_collision_radius", v);
                  }}
                  min={5}
                  max={60}
                  step={5}
                  class="w-32"
                />
                <span class="text-sm tabular-nums w-10"
                  >{editor_settings.graph_force_collision_radius}</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "graph_force_collision_radius",
                      DEFAULT_EDITOR_SETTINGS.graph_force_collision_radius,
                    )}
                  disabled={editor_settings.graph_force_collision_radius ===
                    DEFAULT_EDITOR_SETTINGS.graph_force_collision_radius}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.graph_force_collision_radius)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Repulsion Range</span>
                <span class="SettingsDialog__description"
                  >Maximum distance for repulsion force to act</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.graph_force_charge_max_distance}
                  onValueChange={(v: number | undefined) => {
                    if (v !== undefined)
                      update("graph_force_charge_max_distance", v);
                  }}
                  min={100}
                  max={1500}
                  step={50}
                  class="w-32"
                />
                <span class="text-sm tabular-nums w-10"
                  >{editor_settings.graph_force_charge_max_distance}</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "graph_force_charge_max_distance",
                      DEFAULT_EDITOR_SETTINGS.graph_force_charge_max_distance,
                    )}
                  disabled={editor_settings.graph_force_charge_max_distance ===
                    DEFAULT_EDITOR_SETTINGS.graph_force_charge_max_distance}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.graph_force_charge_max_distance)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
          </div>
        {:else if active_category === "semantic"}
          <h2 class="SettingsDialog__content-header">Semantic</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Similarity Threshold</span>
                <span class="SettingsDialog__description"
                  >Minimum similarity for suggestions and graph edges (lower =
                  more connections)</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.semantic_similarity_threshold * 100}
                  onValueChange={(v: number | undefined) => {
                    if (v !== undefined)
                      update("semantic_similarity_threshold", v / 100);
                  }}
                  min={10}
                  max={90}
                  step={5}
                  class="w-32"
                />
                <span class="text-sm tabular-nums w-10"
                  >{Math.round(
                    editor_settings.semantic_similarity_threshold * 100,
                  )}%</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "semantic_similarity_threshold",
                      DEFAULT_EDITOR_SETTINGS.semantic_similarity_threshold,
                    )}
                  disabled={editor_settings.semantic_similarity_threshold ===
                    DEFAULT_EDITOR_SETTINGS.semantic_similarity_threshold}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.semantic_similarity_threshold * 100)}%)`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Suggested Links Limit</span>
                <span class="SettingsDialog__description"
                  >Max suggested wiki-links shown in the Links panel</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.semantic_suggested_links_limit}
                  onValueChange={(v: number | undefined) => {
                    if (v !== undefined)
                      update("semantic_suggested_links_limit", v);
                  }}
                  min={1}
                  max={15}
                  step={1}
                  class="w-32"
                />
                <span class="text-sm tabular-nums w-10"
                  >{editor_settings.semantic_suggested_links_limit}</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "semantic_suggested_links_limit",
                      DEFAULT_EDITOR_SETTINGS.semantic_suggested_links_limit,
                    )}
                  disabled={editor_settings.semantic_suggested_links_limit ===
                    DEFAULT_EDITOR_SETTINGS.semantic_suggested_links_limit}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.semantic_suggested_links_limit)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Graph Edges per Note</span>
                <span class="SettingsDialog__description"
                  >Semantic neighbors per note in vault graph</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.semantic_graph_edges_per_note}
                  onValueChange={(v: number | undefined) => {
                    if (v !== undefined)
                      update("semantic_graph_edges_per_note", v);
                  }}
                  min={1}
                  max={10}
                  step={1}
                  class="w-32"
                />
                <span class="text-sm tabular-nums w-10"
                  >{editor_settings.semantic_graph_edges_per_note}</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "semantic_graph_edges_per_note",
                      DEFAULT_EDITOR_SETTINGS.semantic_graph_edges_per_note,
                    )}
                  disabled={editor_settings.semantic_graph_edges_per_note ===
                    DEFAULT_EDITOR_SETTINGS.semantic_graph_edges_per_note}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.semantic_graph_edges_per_note)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Graph Max Vault Size</span>
                <span class="SettingsDialog__description"
                  >Semantic edges disabled for vaults larger than this</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.semantic_graph_max_vault_size}
                  onValueChange={(v: number | undefined) => {
                    if (v !== undefined)
                      update("semantic_graph_max_vault_size", v);
                  }}
                  min={50}
                  max={1000}
                  step={50}
                  class="w-32"
                />
                <span class="text-sm tabular-nums w-10"
                  >{editor_settings.semantic_graph_max_vault_size}</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "semantic_graph_max_vault_size",
                      DEFAULT_EDITOR_SETTINGS.semantic_graph_max_vault_size,
                    )}
                  disabled={editor_settings.semantic_graph_max_vault_size ===
                    DEFAULT_EDITOR_SETTINGS.semantic_graph_max_vault_size}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.semantic_graph_max_vault_size)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label"
                  >Omnibar Semantic Fallback</span
                >
                <span class="SettingsDialog__description"
                  >Use semantic search when keyword search returns few results</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.semantic_omnibar_fallback_enabled}
                onCheckedChange={(v: boolean) => {
                  update("semantic_omnibar_fallback_enabled", v);
                }}
              />
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Omnibar Min Words</span>
                <span class="SettingsDialog__description"
                  >Minimum query words to trigger semantic fallback</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Slider
                  type="single"
                  value={editor_settings.semantic_omnibar_min_words}
                  onValueChange={(v: number | undefined) => {
                    if (v !== undefined)
                      update("semantic_omnibar_min_words", v);
                  }}
                  min={2}
                  max={6}
                  step={1}
                  class="w-32"
                />
                <span class="text-sm tabular-nums w-10"
                  >{editor_settings.semantic_omnibar_min_words}</span
                >
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "semantic_omnibar_min_words",
                      DEFAULT_EDITOR_SETTINGS.semantic_omnibar_min_words,
                    )}
                  disabled={editor_settings.semantic_omnibar_min_words ===
                    DEFAULT_EDITOR_SETTINGS.semantic_omnibar_min_words}
                  title={`Reset to default (${String(DEFAULT_EDITOR_SETTINGS.semantic_omnibar_min_words)})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
          </div>
        {:else if active_category === "misc"}
          <h2 class="SettingsDialog__content-header">Misc</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label"
                  >Show Vault Dashboard on Open</span
                >
                <span class="SettingsDialog__description"
                  >Open the vault dashboard automatically when a vault is opened</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.show_vault_dashboard_on_open}
                onCheckedChange={(v: boolean) => {
                  update("show_vault_dashboard_on_open", v);
                }}
              />
            </div>
          </div>
        {:else if active_category === "toolchain"}
          <h2 class="SettingsDialog__content-header">Tools</h2>
          <div class="SettingsDialog__section-content">
            <p class="SettingsDialog__description">
              External tools are downloaded automatically when needed. You can
              also configure custom binary paths below.
            </p>

            <div class="SettingsDialog__section-divider"></div>
            <h3 class="SettingsDialog__section-subheader">
              Markdown Linting (rumdl)
            </h3>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label"
                  >Enable Markdown Linting</span
                >
                <span class="SettingsDialog__description"
                  >Run rumdl in the background to check markdown files for style
                  and formatting issues</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.lint_enabled}
                onCheckedChange={(v: boolean) => {
                  update("lint_enabled", v);
                }}
              />
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Format on Save</span>
                <span class="SettingsDialog__description"
                  >Automatically format the current markdown file when saving</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.lint_format_on_save}
                onCheckedChange={(v: boolean) => {
                  update("lint_format_on_save", v);
                }}
              />
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Formatter</span>
                <span class="SettingsDialog__description"
                  >Which tool to use for markdown formatting</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={editor_settings.lint_formatter}
                  onValueChange={(v: string | undefined) => {
                    if (v) update("lint_formatter", v as LintFormatter);
                  }}
                >
                  <Select.Trigger class="w-32">
                    <span data-slot="select-value">
                      {lint_formatter_options.find(
                        (o) => o.value === editor_settings.lint_formatter,
                      )?.label ?? "Prettier"}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each lint_formatter_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "lint_formatter",
                      DEFAULT_EDITOR_SETTINGS.lint_formatter,
                    )}
                  disabled={editor_settings.lint_formatter ===
                    DEFAULT_EDITOR_SETTINGS.lint_formatter}
                  title="Reset to default (Prettier)"
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row SettingsDialog__row--column">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Rule Overrides (TOML)</span>
                <span class="SettingsDialog__description"
                  >Custom rumdl rule configuration in TOML format, merged with
                  defaults</span
                >
              </div>
              <textarea
                class="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-y rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
                rows={4}
                value={editor_settings.lint_rules_toml}
                oninput={(
                  e: Event & { currentTarget: HTMLTextAreaElement },
                ) => {
                  update("lint_rules_toml", e.currentTarget.value);
                }}
                placeholder={"MD013 = false\nMD040 = true"}
              ></textarea>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">rumdl Binary Path</span>
                <span class="SettingsDialog__description"
                  >Custom path to the rumdl binary. Leave empty to auto-download</span
                >
              </div>
              <Input
                type="text"
                class="w-64"
                placeholder="/usr/local/bin/rumdl"
                value={editor_settings.rumdl_binary_path}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                  update("rumdl_binary_path", e.currentTarget.value);
                }}
              />
            </div>

            <div class="SettingsDialog__section-divider"></div>
            <h3 class="SettingsDialog__section-subheader">
              Markdown Language Server
            </h3>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Enable Markdown LSP</span>
                <span class="SettingsDialog__description"
                  >Enable a language server for wiki-link completion,
                  go-to-definition, hover, code actions, and diagnostics</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.marksman_enabled}
                onCheckedChange={(v: boolean) => {
                  update("marksman_enabled", v);
                }}
              />
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Provider</span>
                <span class="SettingsDialog__description"
                  >IWE adds graph transformations (extract, inline, restructure
                  sections). Marksman provides standard markdown LSP features.</span
                >
              </div>
              <Select.Root
                type="single"
                value={editor_settings.markdown_lsp_provider}
                onValueChange={(v: string) => {
                  update("markdown_lsp_provider", v as MarkdownLspProvider);
                }}
              >
                <Select.Trigger class="w-48">
                  {editor_settings.markdown_lsp_provider === "iwes"
                    ? "IWE"
                    : "Marksman"}
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="iwes">IWE</Select.Item>
                  <Select.Item value="marksman">Marksman</Select.Item>
                </Select.Content>
              </Select.Root>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Binary Path</span>
                <span class="SettingsDialog__description"
                  >Custom path to the LSP binary. Leave empty to auto-detect
                  from PATH or toolchain</span
                >
              </div>
              <Input
                type="text"
                class="w-64"
                placeholder={editor_settings.markdown_lsp_provider === "iwes"
                  ? "/usr/local/bin/iwes"
                  : "/usr/local/bin/marksman"}
                value={editor_settings.marksman_binary_path}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                  update("marksman_binary_path", e.currentTarget.value);
                }}
              />
            </div>

            {#if editor_settings.markdown_lsp_provider === "iwes"}
              <h3 class="SettingsDialog__section-subheader">
                IWE Configuration
              </h3>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">AI Provider</span>
                  <span class="SettingsDialog__description">
                    AI provider for IWE transform actions (rewrite, summarize,
                    expand, etc.)
                  </span>
                </div>
                <div class="flex items-center gap-3">
                  <Select.Root
                    type="single"
                    value={editor_settings.iwe_ai_provider_id}
                    onValueChange={(v: string | undefined) => {
                      if (v) update("iwe_ai_provider_id", v);
                    }}
                    disabled={!editor_settings.ai_enabled}
                  >
                    <Select.Trigger class="w-48">
                      <span data-slot="select-value">
                        {editor_settings.iwe_ai_provider_id === "auto"
                          ? "Auto (use default)"
                          : (editor_settings.ai_providers.find(
                              (p) =>
                                p.id === editor_settings.iwe_ai_provider_id,
                            )?.name ?? editor_settings.iwe_ai_provider_id)}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="auto">Auto (use default)</Select.Item>
                      {#each editor_settings.ai_providers.filter((p) => p.transport.kind === "cli" && !p.transport.args.some( (a) => a.includes("{output_file}"), )) as p (p.id)}
                        <Select.Item value={p.id}>{p.name}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <button
                    type="button"
                    class="SettingsDialog__reset"
                    onclick={() =>
                      update(
                        "iwe_ai_provider_id",
                        DEFAULT_EDITOR_SETTINGS.iwe_ai_provider_id,
                      )}
                    disabled={!editor_settings.ai_enabled ||
                      editor_settings.iwe_ai_provider_id ===
                        DEFAULT_EDITOR_SETTINGS.iwe_ai_provider_id}
                    title="Reset to default (auto)"
                  >
                    <RotateCcw />
                  </button>
                </div>
              </div>

              <div class="SettingsDialog__row">
                <div class="SettingsDialog__label-group">
                  <span class="SettingsDialog__label">Config File</span>
                  <span class="SettingsDialog__description">
                    {#if iwe_config_status?.exists}
                      {iwe_config_status.action_count} action{iwe_config_status.action_count ===
                      1
                        ? ""
                        : "s"} configured: {iwe_config_status.action_names.join(
                        ", ",
                      )}
                    {:else}
                      No config file found — will be created on next LSP start
                    {/if}
                  </span>
                </div>
                <div class="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={on_iwe_open_config}
                    disabled={!iwe_config_status?.exists}
                  >
                    Reveal Config
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={on_iwe_reset_config}
                  >
                    <RotateCcw class="size-3.5 mr-1" />
                    Reset to Defaults
                  </Button>
                </div>
              </div>
            {/if}

            <div class="SettingsDialog__section-divider"></div>
            <h3 class="SettingsDialog__section-subheader">Reference Manager</h3>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Enable References</span>
                <span class="SettingsDialog__description"
                  >Enable the reference manager for citing papers, books, and
                  articles in your notes</span
                >
              </div>
              <Switch.Root
                checked={editor_settings.reference_enabled}
                onCheckedChange={(v: boolean) => {
                  update("reference_enabled", v);
                }}
              />
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Citation Style</span>
                <span class="SettingsDialog__description"
                  >Default CSL citation style for rendering bibliographies (e.g.
                  apa, vancouver, harvard1)</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Input
                  type="text"
                  class="w-48"
                  placeholder="apa"
                  value={editor_settings.reference_citation_style}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                    update("reference_citation_style", e.currentTarget.value);
                  }}
                />
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "reference_citation_style",
                      DEFAULT_EDITOR_SETTINGS.reference_citation_style,
                    )}
                  disabled={editor_settings.reference_citation_style ===
                    DEFAULT_EDITOR_SETTINGS.reference_citation_style}
                  title={`Reset to default (${DEFAULT_EDITOR_SETTINGS.reference_citation_style})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
          </div>
        {:else if active_category === "hotkeys"}
          <h2 class="SettingsDialog__content-header">Hotkeys</h2>

          <HotkeysPanel
            config={hotkeys_config}
            on_edit={on_hotkey_edit}
            on_clear={on_hotkey_clear}
            on_reset_single={on_hotkey_reset_single}
            on_reset_all={on_hotkey_reset_all}
          />
        {/if}
      </div>
    </div>

    <Dialog.Footer class="SettingsDialog__footer">
      {#if error}
        <span class="text-destructive text-sm mr-auto">{error}</span>
      {/if}
      <Button
        variant="outline"
        class="transition-colors"
        onclick={request_close}
        disabled={is_saving}
      >
        Cancel
      </Button>
      <Button
        class="transition-colors"
        onclick={on_save}
        disabled={!has_unsaved_changes || is_saving}
      >
        {is_saving
          ? "Saving..."
          : has_unsaved_changes
            ? "Save Changes"
            : "Saved"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.SettingsDialog) {
    max-width: 60rem;
    width: 55rem;
    height: 80vh;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    padding: 0;
    gap: 0;
    overflow: hidden;
  }

  .SettingsDialog__panels {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .SettingsDialog__nav {
    display: flex;
    flex-direction: column;
    width: 9rem;
    min-width: 9rem;
    padding: var(--space-3);
    gap: var(--space-0-5);
    border-inline-end: 1px solid var(--border);
    overflow-y: auto;
  }

  .SettingsDialog__nav-header {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--foreground);
    padding: var(--space-2) var(--space-2) var(--space-3);
    user-select: none;
  }

  .SettingsDialog__drag-handle {
    cursor: grab;
  }

  .SettingsDialog__nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-2-5);
    width: 100%;
    min-height: var(--size-touch);
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .SettingsDialog__nav-item:hover {
    background-color: var(--muted);
    color: var(--foreground);
  }

  .SettingsDialog__nav-item--selected {
    background-color: var(--interactive-bg);
    color: var(--interactive);
  }

  .SettingsDialog__nav-item--selected:hover {
    background-color: var(--interactive-bg-hover);
    color: var(--interactive);
  }

  .SettingsDialog__nav-item :global(svg) {
    width: var(--size-icon);
    height: var(--size-icon);
    flex-shrink: 0;
  }

  .SettingsDialog__content {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
    min-height: 0;
  }

  .SettingsDialog__content-header {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--foreground);
    margin-bottom: var(--space-6);
  }

  .SettingsDialog__section-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .SettingsDialog__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .SettingsDialog__row--top-aligned {
    align-items: flex-start;
  }

  .SettingsDialog__row--column {
    flex-direction: column;
    align-items: stretch;
  }

  .SettingsDialog__label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
  }

  .SettingsDialog__label-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .SettingsDialog__description {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    line-height: 1.4;
  }

  .SettingsDialog__reset {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .SettingsDialog__reset:hover:not(:disabled) {
    background: var(--muted);
    color: var(--foreground);
  }

  .SettingsDialog__reset:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .SettingsDialog__reset :global(svg) {
    width: 0.9rem;
    height: 0.9rem;
  }

  :global(.SettingsDialog__footer) {
    padding: var(--space-3) var(--space-6);
    border-top: 1px solid var(--border);
  }

  .SettingsDialog__section-divider {
    border-top: 1px solid var(--border);
    margin-block: var(--space-4);
  }

  .SettingsDialog__section-subheader {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--foreground);
    margin-block-end: var(--space-3);
  }
</style>
