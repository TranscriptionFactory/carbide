import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { MetadataService } from "./metadata_service";
import type { MetadataStore } from "../state/metadata_store.svelte";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { SettingsService } from "$lib/features/settings";
import type { EditorSettings } from "$lib/shared/types/editor_settings";

export function register_metadata_actions(
  registry: ActionRegistry,
  metadata_service: MetadataService,
  metadata_store: MetadataStore,
  ui_store: UIStore,
  vault_store: VaultStore,
  settings_service: SettingsService,
) {
  registry.register({
    id: ACTION_IDS.metadata_refresh,
    label: "Refresh Metadata",
    execute: (path: unknown) => {
      if (typeof path !== "string") return;
      metadata_service.refresh(path);
    },
  });

  registry.register({
    id: ACTION_IDS.metadata_toggle_panel,
    label: "Toggle Metadata Panel",
    execute: () => {
      if (
        ui_store.context_rail_open &&
        ui_store.context_rail_tab === "metadata"
      ) {
        ui_store.close_context_rail("metadata");
      } else {
        ui_store.set_context_rail_tab("metadata");
      }
    },
  });

  registry.register({
    id: ACTION_IDS.metadata_add_property,
    label: "Add Metadata Property",
    execute: (key: unknown, value: unknown) => {
      if (typeof key !== "string" || typeof value !== "string") return;
      metadata_store.cancel_edit();
      metadata_service.add_property(key, value);
    },
  });

  registry.register({
    id: ACTION_IDS.metadata_update_property,
    label: "Update Metadata Property",
    execute: (key: unknown, value: unknown) => {
      if (typeof key !== "string" || typeof value !== "string") return;
      metadata_store.cancel_edit();
      metadata_service.update_property(key, value);
    },
  });

  registry.register({
    id: ACTION_IDS.metadata_delete_property,
    label: "Delete Metadata Property",
    execute: (key: unknown) => {
      if (typeof key !== "string") return;
      metadata_service.remove_property(key);
    },
  });

  registry.register({
    id: ACTION_IDS.metadata_set_property_for_path,
    label: "Set Metadata Property For Path",
    execute: async (payload: unknown) => {
      const { note_path, key, value } = (payload ?? {}) as {
        note_path?: unknown;
        key?: unknown;
        value?: unknown;
      };
      if (
        typeof note_path !== "string" ||
        typeof key !== "string" ||
        typeof value !== "string"
      ) {
        return;
      }
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      await metadata_service.set_property_for_path(
        vault_id,
        note_path,
        key,
        value,
      );
    },
  });

  registry.register({
    id: ACTION_IDS.metadata_load_suggestions,
    label: "Load Metadata Suggestions",
    execute: async () => {
      const vault_id = vault_store.active_vault_id;
      if (!vault_id) return;
      await metadata_service.load_suggestions(vault_id);
    },
  });

  registry.register({
    id: ACTION_IDS.metadata_toggle_inline_frontmatter,
    label: "Toggle Inline Frontmatter",
    execute: async () => {
      const updated: EditorSettings = {
        ...ui_store.editor_settings,
        show_inline_frontmatter:
          !ui_store.editor_settings.show_inline_frontmatter,
      };
      const result = await settings_service.save_settings(updated);
      if (result.status === "success") {
        ui_store.set_editor_settings(updated);
      }
    },
  });
}
