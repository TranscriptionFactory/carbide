import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { PluginService } from "./plugin_service";
import type { PluginMarketplaceService } from "./plugin_marketplace_service";

export function register_plugin_actions(
  input: ActionRegistrationInput,
  _service: PluginService,
  marketplace_service: PluginMarketplaceService,
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

  input.registry.register({
    id: ACTION_IDS.plugin_marketplace_fetch,
    label: "Fetch Marketplace Listings",
    execute: () => marketplace_service.fetch_listings(),
  });

  input.registry.register({
    id: ACTION_IDS.plugin_marketplace_install,
    label: "Install Marketplace Plugin",
    execute: async (plugin_id: unknown) => {
      await marketplace_service.install(plugin_id as string);
      await _service.discover();
    },
  });

  input.registry.register({
    id: ACTION_IDS.plugin_marketplace_update,
    label: "Update Marketplace Plugin",
    execute: async (plugin_id: unknown) => {
      const id = plugin_id as string;
      await marketplace_service.install(id);
      await _service.discover();
      await _service.reload_plugin(id);
    },
  });

  input.registry.register({
    id: ACTION_IDS.plugin_marketplace_save_url,
    label: "Save Marketplace URL",
    execute: (url: unknown) => marketplace_service.save_url(url as string),
  });
}
