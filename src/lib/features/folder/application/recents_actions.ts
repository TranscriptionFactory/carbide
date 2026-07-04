import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { BasesPort } from "$lib/features/bases";
import type { VaultStore } from "$lib/features/vault";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { SettingsService } from "$lib/features/settings";
import type { EditorSettings } from "$lib/shared/types/editor_settings";
import {
  build_recents_query,
  default_direction,
  type RecentsPeriod,
  type RecentsSort,
  type SortDirection,
} from "$lib/features/folder/domain/recents";
import type { RecentsStore } from "$lib/features/folder/state/recents_store.svelte";

const RECENTS_LIMIT = 200;

type RecentsActionsInput = {
  registry: ActionRegistry;
  bases_port: BasesPort;
  recents_store: RecentsStore;
  vault_store: VaultStore;
  ui_store: UIStore;
  settings_service: SettingsService;
  now: () => number;
};

async function persist_editor_settings(
  settings_service: SettingsService,
  ui_store: UIStore,
  updated: EditorSettings,
): Promise<void> {
  const result = await settings_service.save_settings(updated);
  if (result.status === "success") {
    ui_store.set_editor_settings(updated);
  }
}

export function register_recents_actions({
  registry,
  bases_port,
  recents_store,
  vault_store,
  ui_store,
  settings_service,
  now,
}: RecentsActionsInput) {
  async function reload() {
    const vault_id = vault_store.active_vault_id;
    if (!vault_id) return;

    const { option, direction } = ui_store.editor_settings.recents_sort;
    const period = ui_store.editor_settings.recents_period;
    const query = build_recents_query({
      sort: option,
      direction,
      period,
      now_ms: now(),
      limit: RECENTS_LIMIT,
    });

    recents_store.loading = true;
    recents_store.error = null;
    try {
      const results = await bases_port.query(vault_id, query);
      recents_store.set_results(results.rows);
    } catch (e) {
      recents_store.error = String(e);
    } finally {
      recents_store.loading = false;
    }
  }

  registry.register({
    id: ACTION_IDS.recents_set_sort,
    label: "Set Recents Sort",
    execute: async (...args: unknown[]) => {
      const option = args[0] as RecentsSort;
      const direction =
        (args[1] as SortDirection | undefined) ?? default_direction(option);
      const updated: EditorSettings = {
        ...ui_store.editor_settings,
        recents_sort: { option, direction },
      };
      await persist_editor_settings(settings_service, ui_store, updated);
      await reload();
    },
  });

  registry.register({
    id: ACTION_IDS.recents_set_period,
    label: "Set Recents Period",
    execute: async (...args: unknown[]) => {
      const period = args[0] as RecentsPeriod;
      const updated: EditorSettings = {
        ...ui_store.editor_settings,
        recents_period: period,
      };
      await persist_editor_settings(settings_service, ui_store, updated);
      await reload();
    },
  });

  registry.register({
    id: ACTION_IDS.recents_reload,
    label: "Reload Recents",
    execute: reload,
  });
}
