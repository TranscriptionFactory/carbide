import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";

export function register_help_actions(input: ActionRegistrationInput) {
  const { registry, stores } = input;

  registry.register({
    id: ACTION_IDS.help_open,
    label: "Open Help",
    execute: (guide?: unknown) => {
      stores.ui.help_dialog = {
        open: true,
        guide: typeof guide === "string" ? guide : null,
      };
    },
  });

  registry.register({
    id: ACTION_IDS.help_close,
    label: "Close Help",
    execute: () => {
      stores.ui.help_dialog = { open: false, guide: null };
    },
  });
}
