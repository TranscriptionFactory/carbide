import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { BasesPort } from "$lib/features/bases";
import type { VaultStore } from "$lib/features/vault";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { SettingsService } from "$lib/features/settings";
import type { EditorSettings } from "$lib/shared/types/editor_settings";
import {
  build_inbox_query,
  default_direction,
  type InboxPeriod,
  type InboxSort,
  type SortDirection,
} from "$lib/features/folder/domain/inbox";
import type { InboxStore } from "$lib/features/folder/state/inbox_store.svelte";

const INBOX_LIMIT = 200;

type InboxActionsInput = {
  registry: ActionRegistry;
  bases_port: BasesPort;
  inbox_store: InboxStore;
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

export function register_inbox_actions({
  registry,
  bases_port,
  inbox_store,
  vault_store,
  ui_store,
  settings_service,
  now,
}: InboxActionsInput) {
  async function reload() {
    const vault_id = vault_store.active_vault_id;
    if (!vault_id) return;

    const { option, direction } = ui_store.editor_settings.inbox_sort;
    const period = ui_store.editor_settings.inbox_period;
    const query = build_inbox_query({
      sort: option,
      direction,
      period,
      now_ms: now(),
      limit: INBOX_LIMIT,
    });

    inbox_store.loading = true;
    inbox_store.error = null;
    try {
      const results = await bases_port.query(vault_id, query);
      inbox_store.set_results(results.rows);
    } catch (e) {
      inbox_store.error = String(e);
    } finally {
      inbox_store.loading = false;
    }
  }

  registry.register({
    id: ACTION_IDS.inbox_set_sort,
    label: "Set Inbox Sort",
    execute: async (...args: unknown[]) => {
      const option = args[0] as InboxSort;
      const direction =
        (args[1] as SortDirection | undefined) ?? default_direction(option);
      const updated: EditorSettings = {
        ...ui_store.editor_settings,
        inbox_sort: { option, direction },
      };
      await persist_editor_settings(settings_service, ui_store, updated);
      await reload();
    },
  });

  registry.register({
    id: ACTION_IDS.inbox_set_period,
    label: "Set Inbox Period",
    execute: async (...args: unknown[]) => {
      const period = args[0] as InboxPeriod;
      const updated: EditorSettings = {
        ...ui_store.editor_settings,
        inbox_period: period,
      };
      await persist_editor_settings(settings_service, ui_store, updated);
      await reload();
    },
  });

  registry.register({
    id: ACTION_IDS.inbox_reload,
    label: "Reload Inbox",
    execute: reload,
  });
}
