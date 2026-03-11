import type { UIStore } from "$lib/app";
import type { SettingsService } from "$lib/features/settings";
import { create_persisted_snapshot_controller } from "$lib/reactors/persisted_snapshot";

const PERSIST_DELAY_MS = 1000;

export function create_recent_commands_persist_reactor(
  ui_store: UIStore,
  settings_service: SettingsService,
): () => void {
  const persist = create_persisted_snapshot_controller({
    delay_ms: PERSIST_DELAY_MS,
    serialize: (ids: string[]) => JSON.stringify(ids),
    save: (ids) => settings_service.save_recent_command_ids(ids),
  });

  return $effect.root(() => {
    $effect(() => {
      persist.schedule(ui_store.recent_command_ids);
    });

    return () => {
      persist.flush_pending();
    };
  });
}
