import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type {
  TerminalService,
  TerminalSessionRequest,
} from "$lib/features/terminal/application/terminal_service";
import { resolve_terminal_session_target } from "$lib/features/terminal/domain/terminal_session_target";
import type { TerminalStore } from "$lib/features/terminal/state/terminal_store.svelte";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

export function register_terminal_actions(
  input: ActionRegistrationInput & {
    terminal_store: TerminalStore;
    terminal_service: TerminalService;
    ui_store: UIStore;
  },
) {
  const { registry, terminal_store, terminal_service, stores, ui_store } =
    input;

  function build_default_request(): TerminalSessionRequest {
    const target = resolve_terminal_session_target({
      follow_active_vault:
        stores.ui.editor_settings.terminal_follow_active_vault,
      followed_cwd: stores.vault.vault?.path ?? undefined,
      fixed_cwd: stores.vault.vault?.path ?? undefined,
    });

    return {
      cols: 80,
      rows: 24,
      shell_path: stores.ui.editor_settings.terminal_shell_path || "/bin/zsh",
      cwd: target.cwd,
      cwd_policy: target.cwd_policy,
      respawn_policy: target.respawn_policy,
    };
  }

  registry.register({
    id: ACTION_IDS.terminal_toggle,
    label: "Toggle Terminal",
    execute: () => {
      if (
        ui_store.bottom_panel_open &&
        ui_store.bottom_panel_tab === "terminal"
      ) {
        terminal_store.hide();
        ui_store.bottom_panel_open = false;
        return;
      }

      ui_store.bottom_panel_tab = "terminal";
      ui_store.bottom_panel_open = true;
      terminal_store.open();
    },
  });

  registry.register({
    id: ACTION_IDS.terminal_close,
    label: "Close Terminal",
    execute: () => {
      terminal_store.hide();
      if (ui_store.bottom_panel_tab === "terminal") {
        ui_store.bottom_panel_open = false;
      }
    },
  });

  registry.register({
    id: ACTION_IDS.terminal_new_session,
    label: "New Terminal Session",
    execute: async (request: unknown) => {
      const actual_request =
        (request as TerminalSessionRequest) ?? build_default_request();
      await terminal_service.create_session(actual_request);
    },
  });

  registry.register({
    id: ACTION_IDS.terminal_activate_session,
    label: "Activate Terminal Session",
    execute: (session_id: unknown) => {
      terminal_service.activate_session(session_id as string);
    },
  });

  registry.register({
    id: ACTION_IDS.terminal_close_session,
    label: "Close Terminal Session",
    execute: (session_id: unknown) => {
      terminal_service.close_session(session_id as string);
      if (terminal_store.session_ids.length === 0) {
        terminal_store.hide();
        if (ui_store.bottom_panel_tab === "terminal") {
          ui_store.bottom_panel_open = false;
        }
      }
    },
  });

  registry.register({
    id: ACTION_IDS.terminal_respawn_session,
    label: "Respawn Terminal Session",
    execute: async (session_id: unknown, request: unknown) => {
      const actual_request =
        (request as TerminalSessionRequest) ?? build_default_request();
      await terminal_service.respawn_session(
        session_id as string,
        actual_request,
      );
    },
  });
}
