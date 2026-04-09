import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import { as_note_path, as_vault_path } from "$lib/shared/types/ids";
import { DEFAULT_HOTKEYS } from "$lib/features/hotkey";
import { set_load_state, set_pagination } from "$lib/features/folder";
import { PAGE_SIZE } from "$lib/shared/constants/pagination";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { toast } from "svelte-sonner";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("app_actions");

type VaultInitializeResult = Awaited<
  ReturnType<ActionRegistrationInput["services"]["vault"]["initialize"]>
>;

type AppBootstrapData = {
  vault_initialize_result: VaultInitializeResult;
  recent_command_ids: Awaited<
    ReturnType<
      ActionRegistrationInput["services"]["settings"]["load_recent_command_ids"]
    >
  >;
  hotkey_overrides: Awaited<
    ReturnType<
      ActionRegistrationInput["services"]["hotkey"]["load_hotkey_overrides"]
    >
  >;
  theme_result: Awaited<
    ReturnType<ActionRegistrationInput["services"]["theme"]["load_themes"]>
  >;
};

function set_startup_loading(input: ActionRegistrationInput) {
  input.stores.ui.startup = {
    status: "loading",
    error: null,
  };
}

function set_startup_error(input: ActionRegistrationInput, error: string) {
  input.stores.ui.startup = {
    status: "error",
    error,
  };
}

function set_startup_idle(input: ActionRegistrationInput) {
  input.stores.ui.startup = {
    status: "idle",
    error: null,
  };
}

async function load_bootstrap_data(
  input: ActionRegistrationInput,
): Promise<AppBootstrapData> {
  const { services, default_mount_config } = input;
  const [
    vault_initialize_result,
    recent_command_ids,
    hotkey_overrides,
    theme_result,
  ] = await Promise.all([
    services.vault.initialize(default_mount_config),
    services.settings.load_recent_command_ids(),
    services.hotkey.load_hotkey_overrides(),
    services.theme.load_themes(),
  ]);

  return {
    vault_initialize_result,
    recent_command_ids,
    hotkey_overrides,
    theme_result,
  };
}

async function load_non_vault_bootstrap_data(
  input: ActionRegistrationInput,
): Promise<Omit<AppBootstrapData, "vault_initialize_result">> {
  const { services } = input;
  const [recent_command_ids, hotkey_overrides, theme_result] =
    await Promise.all([
      services.settings.load_recent_command_ids(),
      services.hotkey.load_hotkey_overrides(),
      services.theme.load_themes(),
    ]);
  return { recent_command_ids, hotkey_overrides, theme_result };
}

function apply_loaded_preferences(
  input: ActionRegistrationInput,
  data: Omit<AppBootstrapData, "vault_initialize_result">,
) {
  const { stores, services } = input;
  stores.ui.set_user_themes(data.theme_result.user_themes);
  stores.ui.set_active_theme_id(data.theme_result.active_theme_id);
  stores.ui.set_color_scheme_preference(
    data.theme_result.color_scheme_preference,
  );
  stores.ui.set_system_light_theme_id(data.theme_result.system_light_theme_id);
  stores.ui.set_system_dark_theme_id(data.theme_result.system_dark_theme_id);
  stores.ui.set_recent_command_ids(data.recent_command_ids);

  stores.ui.hotkey_overrides = data.hotkey_overrides;
  const hotkeys_config = services.hotkey.merge_config(
    DEFAULT_HOTKEYS,
    data.hotkey_overrides,
  );
  stores.ui.set_hotkeys_config(hotkeys_config);
}

function reset_ui_state_for_mount(input: ActionRegistrationInput) {
  input.stores.ui.reset_for_new_vault();
  input.stores.ui.set_editor_settings({ ...DEFAULT_EDITOR_SETTINGS });
}

async function mount_ready_vault_state(
  input: ActionRegistrationInput,
  result: Extract<VaultInitializeResult, { status: "ready" }>,
) {
  if (!result.has_vault) {
    return;
  }

  input.stores.ui.reset_for_new_vault();
  input.stores.ui.set_editor_settings(
    result.editor_settings ?? { ...DEFAULT_EDITOR_SETTINGS },
  );

  set_load_state(input, "", "loaded", null);
  set_pagination(input, "", {
    loaded_count: Math.min(PAGE_SIZE, result.root_total_count),
    total_count: result.root_total_count,
    load_state: "idle",
    error_message: null,
  });

  if (input.stores.vault.is_vault_mode) {
    await input.registry.execute(ACTION_IDS.git_check_repo);

    if (input.stores.ui.editor_settings.show_vault_dashboard_on_open) {
      await input.registry.execute(ACTION_IDS.ui_open_vault_dashboard);
    }
  }
}

async function resolve_pending_file_open(
  input: ActionRegistrationInput,
): Promise<void> {
  if (!is_tauri) return;

  const has_vault = input.stores.vault.vault !== null;
  if (has_vault) return;

  try {
    const pending_path = await tauri_invoke<string | null>(
      "get_pending_file_open",
    );
    if (!pending_path) return;

    log.info("Cold start with pending file open", {
      file_path: pending_path,
    });

    const resolution =
      await input.services.vault.resolve_file_to_vault(pending_path);

    const vault_path = resolution
      ? resolution.vault_path
      : pending_path.substring(0, pending_path.lastIndexOf("/"));

    const relative_path = resolution
      ? resolution.relative_path
      : pending_path.substring(pending_path.lastIndexOf("/") + 1);

    const open_config = {
      ...input.default_mount_config,
      bootstrap_default_vault_path: as_vault_path(vault_path),
      open_file_after_mount: relative_path,
      bootstrap_as_folder: !resolution,
    };

    const vault_result = await input.services.vault.initialize(open_config);
    if (vault_result.status === "ready" && vault_result.has_vault) {
      await mount_ready_vault_state(input, vault_result);
      await input.registry.execute(ACTION_IDS.note_open, {
        note_path: as_note_path(relative_path),
        cleanup_if_missing: false,
      });
    }
  } catch (error) {
    log.error("Failed to handle pending file open", {
      error: String(error),
    });
  }
}

async function execute_app_mounted(input: ActionRegistrationInput) {
  set_startup_loading(input);

  await resolve_pending_file_open(input);

  if (input.stores.vault.vault !== null) {
    apply_loaded_preferences(input, await load_non_vault_bootstrap_data(input));
    set_startup_idle(input);
    return;
  }

  const bootstrap_data = await load_bootstrap_data(input);
  apply_loaded_preferences(input, bootstrap_data);

  if (bootstrap_data.vault_initialize_result.status === "error") {
    set_startup_error(input, bootstrap_data.vault_initialize_result.error);
    return;
  }

  if (input.default_mount_config.reset_app_state) {
    reset_ui_state_for_mount(input);
  }

  await mount_ready_vault_state(input, bootstrap_data.vault_initialize_result);

  if (
    bootstrap_data.vault_initialize_result.has_vault &&
    input.default_mount_config.open_file_after_mount
  ) {
    const file_path = input.default_mount_config.open_file_after_mount;
    if (input.default_mount_config.window_kind === "viewer") {
      await input.registry.execute(ACTION_IDS.document_open, file_path);
    } else {
      await input.registry.execute(ACTION_IDS.note_open, {
        note_path: as_note_path(file_path),
        cleanup_if_missing: false,
      });
    }
  }

  set_startup_idle(input);
}

async function check_for_update_silently() {
  if (!is_tauri) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    return await check();
  } catch {
    return null;
  }
}

async function download_and_install(
  update: NonNullable<Awaited<ReturnType<typeof check_for_update_silently>>>,
) {
  const loading_id = toast.loading(`Downloading update v${update.version}...`);
  try {
    await update.downloadAndInstall();
    toast.dismiss(loading_id);
    toast.success("Update installed — restart Carbide to apply");
  } catch (error) {
    toast.dismiss(loading_id);
    toast.error("Update failed");
    log.error("Update download failed", { error: String(error) });
  }
}

export async function run_auto_update_check(
  is_version_skipped: (version: string) => boolean,
  skip_version: (version: string) => void,
) {
  const update = await check_for_update_silently();
  if (!update) return;
  if (is_version_skipped(update.version)) return;

  toast.info(`Carbide v${update.version} is available`, {
    duration: 30_000,
    action: {
      label: "Update",
      onClick: () => void download_and_install(update),
    },
    cancel: {
      label: "Skip",
      onClick: () => skip_version(update.version),
    },
  });
}

async function execute_app_check_for_updates() {
  if (!is_tauri) {
    toast.info("Updates are only available in the desktop app");
    return;
  }

  const loading_toast_id = toast.loading("Checking for updates...");

  try {
    const update = await check_for_update_silently();
    toast.dismiss(loading_toast_id);
    if (!update) {
      toast.success("Carbide is up to date");
      return;
    }
    await download_and_install(update);
  } catch (error) {
    toast.dismiss(loading_toast_id);
    toast.error("Failed to check for updates");
    log.error("Update check failed", { error: String(error) });
  }
}

export function register_app_actions(input: ActionRegistrationInput) {
  const { registry, services } = input;

  registry.register({
    id: ACTION_IDS.app_mounted,
    label: "App Mounted",
    execute: async () => execute_app_mounted(input),
  });

  registry.register({
    id: ACTION_IDS.app_editor_mount,
    label: "Editor Mount",
    execute: async (root: unknown, note: unknown) => {
      await services.editor.mount({
        root: root as HTMLDivElement,
        note: note as OpenNoteState,
      });
    },
  });

  registry.register({
    id: ACTION_IDS.app_editor_unmount,
    label: "Editor Unmount",
    execute: () => {
      services.editor.unmount();
    },
  });

  registry.register({
    id: ACTION_IDS.editor_toggle_mode,
    label: "Toggle Editor Mode",
    execute: () => {
      const editor_store = input.stores.editor;
      const current = editor_store.editor_mode;

      if (current === "visual") {
        const md_offset = services.editor.get_cursor_markdown_offset();
        const flush_result = services.editor.flush();
        if (flush_result) {
          const scroll_top = services.editor.get_scroll_top();
          const markdown_len = flush_result.markdown.length;
          editor_store.set_scroll_fraction(
            markdown_len > 0
              ? Math.min(scroll_top / (markdown_len * 0.5), 1)
              : 0,
          );
          editor_store.set_cursor_offset(
            Math.min(md_offset, flush_result.markdown.length),
          );
        }
      } else if (current === "source") {
        const cursor_offset = editor_store.cursor_offset;
        services.editor.flush();
        const open_note = editor_store.open_note;
        if (open_note) {
          services.editor.sync_visual_from_markdown(open_note.markdown);
          services.editor.set_editable(true);
          services.editor.set_cursor_from_markdown_offset(cursor_offset);
          if (!open_note.is_dirty) {
            services.editor.mark_clean_from_editor();
          }
        }
      } else if (current === "read_only") {
        services.editor.set_editable(true);
      }

      editor_store.toggle_editor_mode();
    },
  });

  registry.register({
    id: ACTION_IDS.editor_toggle_split_view,
    label: "Toggle Split View",
    execute: () => {
      const editor_store = input.stores.editor;
      const entering_split = !editor_store.split_view;

      if (entering_split) {
        if (editor_store.editor_mode === "read_only") return;
        services.editor.flush();
        const open_note = editor_store.open_note;
        if (open_note && editor_store.editor_mode === "source") {
          services.editor.sync_visual_from_markdown(open_note.markdown);
          services.editor.set_editable(true);
          if (!open_note.is_dirty) {
            services.editor.mark_clean_from_editor();
          }
        }
      } else {
        services.editor.flush();
      }

      editor_store.toggle_split_view();
    },
  });

  registry.register({
    id: ACTION_IDS.editor_toggle_read_only,
    label: "Toggle Read-only Mode",
    execute: () => {
      const editor_store = input.stores.editor;
      if (editor_store.editor_mode === "read_only") {
        services.editor.set_editable(true);
        editor_store.set_editor_mode("visual");
      } else {
        if (editor_store.editor_mode === "visual") {
          services.editor.flush();
        } else if (editor_store.editor_mode === "source") {
          services.editor.flush();
          const open_note = editor_store.open_note;
          if (open_note) {
            services.editor.sync_visual_from_markdown(open_note.markdown);
            if (!open_note.is_dirty) {
              services.editor.mark_clean_from_editor();
            }
          }
        }
        if (editor_store.split_view) {
          editor_store.set_split_view(false);
        }
        services.editor.set_editable(false);
        editor_store.set_editor_mode("read_only");
      }
    },
  });

  registry.register({
    id: ACTION_IDS.editor_toggle_line_numbers,
    label: "Toggle Line Numbers",
    execute: async () => {
      const current =
        input.stores.ui.editor_settings.source_editor_line_numbers;
      const updated = {
        ...input.stores.ui.editor_settings,
        source_editor_line_numbers: !current,
      };
      input.stores.ui.set_editor_settings(updated);
      await services.settings.save_settings(updated);
    },
  });

  registry.register({
    id: ACTION_IDS.editor_zoom_in,
    label: "Zoom In",
    execute: () => {
      input.stores.editor.zoom_in();
    },
  });

  registry.register({
    id: ACTION_IDS.editor_zoom_out,
    label: "Zoom Out",
    execute: () => {
      input.stores.editor.zoom_out();
    },
  });

  registry.register({
    id: ACTION_IDS.editor_zoom_reset,
    label: "Reset Zoom",
    execute: () => {
      input.stores.editor.zoom_reset();
    },
  });

  registry.register({
    id: ACTION_IDS.editor_sync_visual_from_store,
    label: "Sync Visual Editor from Store",
    execute: () => {
      const open_note = input.stores.editor.open_note;
      if (!open_note) return;
      services.editor.sync_visual_from_markdown_diff(open_note.markdown);
    },
  });

  registry.register({
    id: ACTION_IDS.editor_fold_toggle,
    label: "Toggle Heading Fold",
    execute: () => {
      services.editor.toggle_heading_fold();
    },
  });

  registry.register({
    id: ACTION_IDS.editor_fold_collapse_all,
    label: "Collapse All Headings",
    execute: () => {
      services.editor.collapse_all_heading_folds();
    },
  });

  registry.register({
    id: ACTION_IDS.editor_fold_expand_all,
    label: "Expand All Headings",
    execute: () => {
      services.editor.expand_all_heading_folds();
    },
  });

  registry.register({
    id: ACTION_IDS.app_check_for_updates,
    label: "Check for Updates",
    execute: async () => execute_app_check_for_updates(),
  });

  registry.register({
    id: ACTION_IDS.app_handle_file_open,
    label: "Handle File Open",
    execute: async (file_path_raw: unknown) => {
      // Small delay to ensure that if this was triggered by a single-instance event,
      // all frontend reactors have finished their cycle.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const file_path = file_path_raw as string;
      try {
        const resolution =
          await services.vault.resolve_file_to_vault(file_path);

        const current_vault_id = input.stores.vault.vault?.id;

        if (resolution && current_vault_id === resolution.vault_id) {
          await registry.execute(ACTION_IDS.note_open, {
            note_path: as_note_path(resolution.relative_path),
            cleanup_if_missing: false,
          });
          return;
        }

        const vault_path = resolution
          ? resolution.vault_path
          : file_path.substring(0, file_path.lastIndexOf("/"));

        const relative_path = resolution
          ? resolution.relative_path
          : file_path.substring(file_path.lastIndexOf("/") + 1);

        if (!current_vault_id) {
          await services.vault.change_folder_by_path(as_vault_path(vault_path));
          await registry.execute(ACTION_IDS.note_open, {
            note_path: as_note_path(relative_path),
            cleanup_if_missing: false,
          });
          return;
        }

        await registry.execute(ACTION_IDS.window_open_viewer, relative_path);
      } catch (error) {
        log.error("Failed to handle file open", { error: String(error) });
        toast.error("Failed to open file");
      }
    },
  });
}
