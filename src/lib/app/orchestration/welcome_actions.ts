import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("welcome_actions");

async function mark_welcome_seen(input: ActionRegistrationInput) {
  try {
    await input.services.settings.mark_welcome_seen();
  } catch (error) {
    log.error("Mark welcome seen failed", { error: String(error) });
  }
}

export function register_welcome_actions(input: ActionRegistrationInput) {
  const { registry, stores } = input;

  registry.register({
    id: ACTION_IDS.welcome_open,
    label: "Open Welcome",
    execute: () => {
      stores.ui.welcome_dialog = { open: true };
    },
  });

  registry.register({
    id: ACTION_IDS.welcome_close,
    label: "Close Welcome",
    execute: async () => {
      stores.ui.welcome_dialog = { open: false };
      await mark_welcome_seen(input);
    },
  });
}
