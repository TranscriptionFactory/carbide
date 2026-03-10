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
  import KeyboardIcon from "@lucide/svelte/icons/keyboard";
  import { HotkeysPanel } from "$lib/features/hotkey";
  import ThemeSettings from "$lib/features/settings/ui/theme_settings.svelte";
  import type {
    AiDefaultBackend,
    DocumentImageBackground,
    DocumentPdfZoomMode,
    EditorSettings,
    GitAutocommitMode,
    GitPullStrategy,
    SettingsCategory,
  } from "$lib/shared/types/editor_settings";
  import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
  import type { Theme } from "$lib/shared/types/theme";
  import type { HotkeyConfig, HotkeyBinding } from "$lib/features/hotkey";

  type Props = {
    open: boolean;
    editor_settings: EditorSettings;
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
  };

  let {
    open,
    editor_settings,
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

  const auto_fetch_interval_options = [0, 5, 15, 30, 60].map((n) => ({
    value: String(n),
    label: n === 0 ? "Off" : `${String(n)} min`,
  }));

  const terminal_font_size_options = [11, 12, 13, 14, 15, 16, 18].map((n) => ({
    value: String(n),
    label: `${String(n)} px`,
  }));

  const terminal_scrollback_options = [1000, 5000, 10000, 20000].map((n) => ({
    value: String(n),
    label: n.toLocaleString(),
  }));

  const ai_timeout_options = [60, 120, 300, 600].map((n) => ({
    value: String(n),
    label: n >= 60 ? `${String(n / 60)} min` : `${String(n)} sec`,
  }));

  const ai_backend_options: { value: AiDefaultBackend; label: string }[] = [
    { value: "auto", label: "Auto" },
    { value: "claude", label: "Claude" },
    { value: "codex", label: "Codex" },
    { value: "ollama", label: "Ollama" },
  ];

  const pdf_zoom_options: { value: DocumentPdfZoomMode; label: string }[] = [
    { value: "actual_size", label: "Actual Size" },
    { value: "fit_width", label: "Fit Width" },
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
    { id: "misc", label: "Misc", icon: SlidersIcon },
    { id: "hotkeys", label: "Hotkeys", icon: KeyboardIcon },
  ];

  const ai_settings_disabled = $derived(!editor_settings.ai_enabled);
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value && !is_saving) on_close();
  }}
>
  <Dialog.Content class="SettingsDialog">
    <Dialog.Header class="sr-only">
      <Dialog.Title>Settings</Dialog.Title>
      <Dialog.Description>Customize your editor experience</Dialog.Description>
    </Dialog.Header>

    <div class="SettingsDialog__panels">
      <nav class="SettingsDialog__nav">
        <div class="SettingsDialog__nav-header">Settings</div>
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
            on_switch={on_theme_switch}
            on_create={on_theme_create}
            on_duplicate={on_theme_duplicate}
            on_rename={on_theme_rename}
            on_delete={on_theme_delete}
            on_update={on_theme_update}
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
                <span class="SettingsDialog__label">Default Backend</span>
                <span class="SettingsDialog__description"
                  >Auto selects the first available CLI in Claude, Codex, then
                  Ollama order</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Select.Root
                  type="single"
                  value={editor_settings.ai_default_backend}
                  onValueChange={(v: string | undefined) => {
                    if (
                      v === "auto" ||
                      v === "claude" ||
                      v === "codex" ||
                      v === "ollama"
                    ) {
                      update("ai_default_backend", v);
                    }
                  }}
                  disabled={ai_settings_disabled}
                >
                  <Select.Trigger class="w-36">
                    <span data-slot="select-value">
                      {ai_backend_options.find(
                        (opt) =>
                          opt.value === editor_settings.ai_default_backend,
                      )?.label ?? editor_settings.ai_default_backend}
                    </span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each ai_backend_options as opt (opt.value)}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "ai_default_backend",
                      DEFAULT_EDITOR_SETTINGS.ai_default_backend,
                    )}
                  disabled={ai_settings_disabled ||
                    editor_settings.ai_default_backend ===
                      DEFAULT_EDITOR_SETTINGS.ai_default_backend}
                  title={`Reset to default (${DEFAULT_EDITOR_SETTINGS.ai_default_backend})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Ollama Model</span>
                <span class="SettingsDialog__description"
                  >Default local model used for Ollama-powered edits</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Input
                  type="text"
                  value={editor_settings.ai_ollama_model}
                  onchange={(
                    e: Event & { currentTarget: HTMLInputElement },
                  ) => {
                    update("ai_ollama_model", e.currentTarget.value);
                  }}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                    update("ai_ollama_model", e.currentTarget.value);
                  }}
                  class="w-48"
                  placeholder="qwen3:8b"
                  disabled={ai_settings_disabled}
                />
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "ai_ollama_model",
                      DEFAULT_EDITOR_SETTINGS.ai_ollama_model,
                    )}
                  disabled={ai_settings_disabled ||
                    editor_settings.ai_ollama_model ===
                      DEFAULT_EDITOR_SETTINGS.ai_ollama_model}
                  title={`Reset to default (${DEFAULT_EDITOR_SETTINGS.ai_ollama_model})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Claude Command</span>
                <span class="SettingsDialog__description"
                  >CLI command or executable path for Claude Code</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Input
                  type="text"
                  value={editor_settings.ai_claude_command}
                  onchange={(
                    e: Event & { currentTarget: HTMLInputElement },
                  ) => {
                    update("ai_claude_command", e.currentTarget.value);
                  }}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                    update("ai_claude_command", e.currentTarget.value);
                  }}
                  class="w-48"
                  placeholder="claude"
                  disabled={ai_settings_disabled}
                />
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "ai_claude_command",
                      DEFAULT_EDITOR_SETTINGS.ai_claude_command,
                    )}
                  disabled={ai_settings_disabled ||
                    editor_settings.ai_claude_command ===
                      DEFAULT_EDITOR_SETTINGS.ai_claude_command}
                  title={`Reset to default (${DEFAULT_EDITOR_SETTINGS.ai_claude_command})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Codex Command</span>
                <span class="SettingsDialog__description"
                  >CLI command or executable path for Codex</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Input
                  type="text"
                  value={editor_settings.ai_codex_command}
                  onchange={(
                    e: Event & { currentTarget: HTMLInputElement },
                  ) => {
                    update("ai_codex_command", e.currentTarget.value);
                  }}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                    update("ai_codex_command", e.currentTarget.value);
                  }}
                  class="w-48"
                  placeholder="codex"
                  disabled={ai_settings_disabled}
                />
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "ai_codex_command",
                      DEFAULT_EDITOR_SETTINGS.ai_codex_command,
                    )}
                  disabled={ai_settings_disabled ||
                    editor_settings.ai_codex_command ===
                      DEFAULT_EDITOR_SETTINGS.ai_codex_command}
                  title={`Reset to default (${DEFAULT_EDITOR_SETTINGS.ai_codex_command})`}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>

            <div class="SettingsDialog__row">
              <div class="SettingsDialog__label-group">
                <span class="SettingsDialog__label">Ollama Command</span>
                <span class="SettingsDialog__description"
                  >CLI command or executable path for Ollama</span
                >
              </div>
              <div class="flex items-center gap-3">
                <Input
                  type="text"
                  value={editor_settings.ai_ollama_command}
                  onchange={(
                    e: Event & { currentTarget: HTMLInputElement },
                  ) => {
                    update("ai_ollama_command", e.currentTarget.value);
                  }}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                    update("ai_ollama_command", e.currentTarget.value);
                  }}
                  class="w-48"
                  placeholder="ollama"
                  disabled={ai_settings_disabled}
                />
                <button
                  type="button"
                  class="SettingsDialog__reset"
                  onclick={() =>
                    update(
                      "ai_ollama_command",
                      DEFAULT_EDITOR_SETTINGS.ai_ollama_command,
                    )}
                  disabled={ai_settings_disabled ||
                    editor_settings.ai_ollama_command ===
                      DEFAULT_EDITOR_SETTINGS.ai_ollama_command}
                  title={`Reset to default (${DEFAULT_EDITOR_SETTINGS.ai_ollama_command})`}
                >
                  <RotateCcw />
                </button>
              </div>
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
          </div>
        {:else if active_category === "files"}
          <h2 class="SettingsDialog__content-header">Files</h2>

          <div class="SettingsDialog__section-content">
            <div class="SettingsDialog__row">
              <span class="SettingsDialog__label">Attachment Folder</span>
              <Input
                type="text"
                value={editor_settings.attachment_folder}
                onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                  update("attachment_folder", e.currentTarget.value);
                }}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                  update("attachment_folder", e.currentTarget.value);
                }}
                class="w-48"
                placeholder=".assets"
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
                  onchange={(
                    e: Event & { currentTarget: HTMLInputElement },
                  ) => {
                    on_git_remote_url_change(e.currentTarget.value);
                  }}
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
                  onchange={(
                    e: Event & { currentTarget: HTMLInputElement },
                  ) => {
                    update("terminal_shell_path", e.currentTarget.value);
                  }}
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
                <span class="SettingsDialog__label">Scrollback</span>
                <span class="SettingsDialog__description"
                  >Maximum number of terminal lines kept in history</span
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
                  <Select.Trigger class="w-28">
                    <span data-slot="select-value"
                      >{editor_settings.terminal_scrollback.toLocaleString()}</span
                    >
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
                  title={`Reset to default (${DEFAULT_EDITOR_SETTINGS.terminal_scrollback.toLocaleString()})`}
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
        onclick={on_close}
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
    max-width: 52rem;
    width: 52rem;
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
    width: 12rem;
    min-width: 12rem;
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
</style>
