import type { UIStore } from "$lib/app";
import type { SettingsService } from "$lib/features/settings";
import { create_persisted_snapshot_controller } from "$lib/reactors/persisted_snapshot";

const PERSIST_DELAY_MS = 1000;

export function create_outline_pane_persist_reactor(
  ui_store: UIStore,
  settings_service: SettingsService,
): () => void {
  const persist = create_persisted_snapshot_controller({
    delay_ms: PERSIST_DELAY_MS,
    serialize: (size: number) => String(size),
    save: (size) => settings_service.save_outline_pane_size(size),
  });

  return $effect.root(() => {
    $effect(() => {
      persist.schedule(ui_store.outline_pane_size);
    });

    return () => {
      persist.flush_pending();
    };
  });
}
