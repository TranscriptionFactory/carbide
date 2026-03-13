import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { PluginService } from "./plugin_service";

export function register_plugin_actions(
  input: ActionRegistrationInput,
  _service: PluginService,
) {
  input.registry.register({
    id: ACTION_IDS.ui_open_plugins,
    label: "Open Plugins",
    execute: () => {
      input.stores.ui.sidebar_view = "plugins";
      if (!input.stores.ui.sidebar_open) {
        input.stores.ui.sidebar_open = true;
      }
    },
  });
}
