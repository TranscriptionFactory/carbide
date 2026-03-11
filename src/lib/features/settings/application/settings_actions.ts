import { toast } from "svelte-sonner";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import type {
  EditorSettings,
  SettingsCategory,
} from "$lib/shared/types/editor_settings";

export function register_settings_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  let settings_open_revision = 0;

  function arrays_equal(a: string[], b: string[]) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => value === b[index]);
  }

  function editor_settings_equal(a: EditorSettings, b: EditorSettings) {
    return (
      a.attachment_folder === b.attachment_folder &&
      arrays_equal(a.ignored_folders, b.ignored_folders) &&
      a.show_hidden_files === b.show_hidden_files &&
      a.autosave_enabled === b.autosave_enabled &&
      a.autosave_delay_ms === b.autosave_delay_ms &&
      a.git_autocommit_mode === b.git_autocommit_mode &&
      a.git_autocommit_interval_minutes === b.git_autocommit_interval_minutes &&
      a.git_pull_strategy === b.git_pull_strategy &&
      a.git_auto_fetch_interval_minutes === b.git_auto_fetch_interval_minutes &&
      a.show_vault_dashboard_on_open === b.show_vault_dashboard_on_open &&
      a.max_open_tabs === b.max_open_tabs &&
      a.editor_max_width_ch === b.editor_max_width_ch &&
      a.terminal_shell_path === b.terminal_shell_path &&
      a.terminal_font_size_px === b.terminal_font_size_px &&
      a.terminal_scrollback === b.terminal_scrollback &&
      a.terminal_cursor_blink === b.terminal_cursor_blink &&
      a.terminal_follow_active_vault === b.terminal_follow_active_vault &&
      a.ai_enabled === b.ai_enabled &&
      a.ai_default_backend === b.ai_default_backend &&
      a.ai_ollama_model === b.ai_ollama_model &&
      a.ai_claude_command === b.ai_claude_command &&
      a.ai_codex_command === b.ai_codex_command &&
      a.ai_ollama_command === b.ai_ollama_command &&
      a.ai_execution_timeout_seconds === b.ai_execution_timeout_seconds &&
      a.document_pdf_default_zoom === b.document_pdf_default_zoom &&
      a.document_code_wrap === b.document_code_wrap &&
      a.document_image_background === b.document_image_background &&
      a.document_inactive_cache_limit === b.document_inactive_cache_limit
    );
  }

  function parse_settings_category(value: unknown): SettingsCategory {
    return (typeof value === "string" ? value : "theme") as SettingsCategory;
  }

  function build_hotkey_draft(overrides: typeof stores.ui.hotkey_overrides) {
    const draft_overrides = [...overrides];
    const draft_config = services.hotkey.merge_config(
      DEFAULT_HOTKEYS,
      draft_overrides,
    );
    return {
      draft_overrides,
      draft_config,
    };
  }

  function set_settings_dialog_open(
    category: SettingsCategory,
    settings_snapshot: EditorSettings,
  ) {
    const { draft_overrides, draft_config } = build_hotkey_draft(
      stores.ui.hotkey_overrides,
    );
    stores.ui.settings_dialog = {
      open: true,
      current_settings: settings_snapshot,
      persisted_settings: settings_snapshot,
      git_remote_url: stores.git.remote_url ?? "",
      persisted_git_remote_url: stores.git.remote_url ?? "",
      has_unsaved_changes: false,
      active_category: category,
      hotkey_draft_overrides: draft_overrides,
      hotkey_draft_config: draft_config,
    };
  }

  function close_settings_dialog() {
    const persisted_settings = stores.ui.settings_dialog.persisted_settings;
    stores.ui.set_editor_settings(persisted_settings);

    const { draft_overrides, draft_config } = build_hotkey_draft(
      stores.ui.hotkey_overrides,
    );
    stores.ui.settings_dialog = {
      ...stores.ui.settings_dialog,
      open: false,
      current_settings: persisted_settings,
      git_remote_url: stores.ui.settings_dialog.persisted_git_remote_url,
      has_unsaved_changes: false,
      hotkey_draft_overrides: draft_overrides,
      hotkey_draft_config: draft_config,
    };
  }

  async function persist_hotkey_draft() {
    const draft_overrides = stores.ui.settings_dialog.hotkey_draft_overrides;
    await services.hotkey.save_hotkey_overrides(draft_overrides);
    stores.ui.hotkey_overrides = draft_overrides;

    const config = services.hotkey.merge_config(
      DEFAULT_HOTKEYS,
      draft_overrides,
    );
    stores.ui.set_hotkeys_config(config);
    stores.ui.settings_dialog = {
      ...stores.ui.settings_dialog,
      hotkey_draft_config: config,
    };
  }

  registry.register({
    id: ACTION_IDS.settings_open,
    label: "Open Settings",
    execute: async (arg: unknown) => {
      const category = parse_settings_category(arg);
      const open_revision = ++settings_open_revision;
      const settings_snapshot = { ...stores.ui.editor_settings };
      set_settings_dialog_open(category, settings_snapshot);

      const result = await services.settings.load_settings(
        stores.ui.editor_settings,
      );
      if (open_revision !== settings_open_revision) {
        return;
      }
      if (!stores.ui.settings_dialog.open) {
        return;
      }
      if (result.status === "success") {
        stores.ui.settings_dialog = {
          ...stores.ui.settings_dialog,
          current_settings: result.settings,
          persisted_settings: result.settings,
          git_remote_url: stores.git.remote_url ?? "",
          persisted_git_remote_url: stores.git.remote_url ?? "",
          has_unsaved_changes: false,
        };
        stores.ui.set_editor_settings(result.settings);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.settings_close,
    label: "Close Settings",
    execute: () => {
      if (stores.op.is_pending("settings.save")) {
        return;
      }
      settings_open_revision += 1;
      close_settings_dialog();
      void registry.execute(ACTION_IDS.theme_revert);
      services.settings.reset_load_operation();
      services.settings.reset_save_operation();
    },
  });

  registry.register({
    id: ACTION_IDS.settings_update,
    label: "Update Settings",
    execute: (settings: unknown) => {
      const editor_settings = settings as EditorSettings;
      stores.ui.settings_dialog = {
        ...stores.ui.settings_dialog,
        current_settings: editor_settings,
        has_unsaved_changes: !editor_settings_equal(
          editor_settings,
          stores.ui.settings_dialog.persisted_settings,
        ),
      };
    },
  });

  registry.register({
    id: ACTION_IDS.settings_save,
    label: "Save Settings",
    execute: async () => {
      const settings = stores.ui.settings_dialog.current_settings;
      const persisted_settings = stores.ui.settings_dialog.persisted_settings;
      const next_remote_url = stores.ui.settings_dialog.git_remote_url.trim();
      const persisted_remote_url =
        stores.ui.settings_dialog.persisted_git_remote_url.trim();
      const ignored_folders_changed = !arrays_equal(
        settings.ignored_folders,
        persisted_settings.ignored_folders,
      );
      const result = await services.settings.save_settings(settings);

      if (result.status === "success") {
        stores.ui.set_editor_settings(settings);
        stores.ui.settings_dialog = {
          ...stores.ui.settings_dialog,
          persisted_settings: settings,
          has_unsaved_changes: false,
        };
        if (ignored_folders_changed) {
          await registry.execute(ACTION_IDS.folder_refresh_tree);
          if (stores.vault.is_vault_mode) {
            await registry.execute(ACTION_IDS.vault_sync_index);
          }
        }
      }

      if (next_remote_url !== persisted_remote_url) {
        if (next_remote_url === "") {
          toast.error("Clearing the git remote URL is not supported yet");
        } else if (!stores.git.enabled) {
          toast.error(
            "Initialize Git for this vault before configuring a remote",
          );
        } else {
          const remote_result =
            await services.git.set_remote_url(next_remote_url);
          if (remote_result.success) {
            stores.ui.settings_dialog = {
              ...stores.ui.settings_dialog,
              git_remote_url: next_remote_url,
              persisted_git_remote_url: next_remote_url,
            };
          } else {
            toast.error(
              remote_result.error ?? "Failed to update the git remote URL",
            );
          }
        }
      }

      await persist_hotkey_draft();
      await registry.execute(ACTION_IDS.theme_save);
    },
  });
}
