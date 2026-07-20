import type { UIStore } from "$lib/app";
import type { SettingsService } from "$lib/features/settings";
import { create_persisted_snapshot_controller } from "$lib/reactors/persisted_snapshot";
import { PANE_SIZE_FIELDS } from "$lib/reactors/pane_size_fields";

const PERSIST_DELAY_MS = 1000;

export function create_pane_size_persist_reactor(
  ui_store: UIStore,
  settings_service: SettingsService,
): () => void {
  const controllers = PANE_SIZE_FIELDS.map((field) => ({
    field,
    persist: create_persisted_snapshot_controller({
      delay_ms: PERSIST_DELAY_MS,
      serialize: (size: number) => String(size),
      save: (size: number) => settings_service.save_pane_size(field.key, size),
    }),
  }));

  return $effect.root(() => {
    for (const { field, persist } of controllers) {
      $effect(() => {
        persist.schedule(field.get(ui_store));
      });
    }

    return () => {
      for (const { persist } of controllers) {
        persist.flush_pending();
      }
    };
  });
}
