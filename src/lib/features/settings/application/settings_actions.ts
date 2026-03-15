import { toast } from "svelte-sonner";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { reconcile_workspace } from "$lib/app/orchestration/workspace_reconcile";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import type {
  EditorSettings,
  SettingsCategory,
} from "$lib/shared/types/editor_settings";

const SETTINGS_COMPARE_KEYS: readonly (keyof EditorSettings)[] = [
  "attachment_folder",
  "show_hidden_files",
  "autosave_enabled",
  "autosave_delay_ms",
  "git_autocommit_mode",
  "git_autocommit_interval_minutes",
  "git_pull_strategy",
  "git_auto_fetch_interval_minutes",
  "show_vault_dashboard_on_open",
  "max_open_tabs",
  "editor_max_width_ch",
  "editor_selection_color",
  "editor_paragraph_spacing_density",
  "editor_list_spacing_density",
  "editor_code_block_padding",
  "editor_code_block_radius",
  "editor_blockquote_padding",
  "editor_blockquote_border_width",
  "editor_link_underline_style",
  "terminal_shell_path",
  "terminal_font_size_px",
  "terminal_cursor_blink",
  "terminal_follow_active_vault",
  "ai_enabled",
  "ai_providers",
  "ai_default_provider_id",
  "ai_execution_timeout_seconds",
  "document_pdf_default_zoom",
  "document_code_wrap",
  "document_image_background",
  "document_inactive_cache_limit",
  "semantic_similarity_threshold",
  "semantic_suggested_links_limit",
  "semantic_graph_edges_per_note",
  "semantic_graph_max_vault_size",
  "semantic_omnibar_fallback_enabled",
  "semantic_omnibar_min_words",
] as const;

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
      arrays_equal(a.ignored_folders, b.ignored_folders) &&
      SETTINGS_COMPARE_KEYS.every((key) => a[key] === b[key])
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
      all_folder_paths: [],
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

      const vault_id = stores.vault.vault?.id;
      if (vault_id) {
        services.note
          .list_all_folders(vault_id)
          .then((folders) => {
            if (open_revision !== settings_open_revision) return;
            if (!stores.ui.settings_dialog.open) return;
            stores.ui.settings_dialog = {
              ...stores.ui.settings_dialog,
              all_folder_paths: folders,
            };
          })
          .catch(() => {});
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
      const semantic_graph_changed =
        settings.semantic_similarity_threshold !==
          persisted_settings.semantic_similarity_threshold ||
        settings.semantic_graph_edges_per_note !==
          persisted_settings.semantic_graph_edges_per_note ||
        settings.semantic_graph_max_vault_size !==
          persisted_settings.semantic_graph_max_vault_size;
      const result = await services.settings.save_settings(settings);

      if (result.status === "success") {
        stores.ui.set_editor_settings(settings);
        stores.ui.settings_dialog = {
          ...stores.ui.settings_dialog,
          persisted_settings: settings,
          has_unsaved_changes: false,
        };
        if (ignored_folders_changed) {
          await reconcile_workspace(
            registry,
            {
              refresh_tree: true,
              sync_index: stores.vault.is_vault_mode,
            },
            {
              workspace_reconcile: input.workspace_reconcile,
              is_vault_mode: stores.vault.is_vault_mode,
            },
          );
        }
        if (semantic_graph_changed) {
          stores.graph.set_semantic_edges([]);
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
