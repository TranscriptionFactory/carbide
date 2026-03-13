import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { TerminalService } from "$lib/features/terminal/application/terminal_service";
import type { TerminalStore } from "$lib/features/terminal/state/terminal_store.svelte";

export function register_terminal_actions(
  input: ActionRegistrationInput & {
    terminal_store: TerminalStore;
    terminal_service: TerminalService;
  },
) {
  const { registry, terminal_store, terminal_service } = input;

  registry.register({
    id: ACTION_IDS.terminal_toggle,
    label: "Toggle Terminal",
    execute: () => {
      if (terminal_store.panel_open) {
        terminal_service.close_active_session();
        terminal_store.close();
        return;
      }

      terminal_store.open();
    },
  });

  registry.register({
    id: ACTION_IDS.terminal_close,
    label: "Close Terminal",
    execute: () => {
      terminal_service.close_active_session();
      terminal_store.close();
    },
  });
}
