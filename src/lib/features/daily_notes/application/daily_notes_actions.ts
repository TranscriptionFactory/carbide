import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { SIDEBAR_VIEWS } from "$lib/app/sidebar_views";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { DailyNotesService } from "$lib/features/daily_notes/application/daily_notes_service";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

export function register_daily_notes_actions(
  registry: ActionRegistry,
  service: DailyNotesService,
  ui_store: UIStore,
) {
  registry.register({
    id: ACTION_IDS.daily_notes_open_today,
    label: "Daily Notes: Open Today",
    execute: async () => {
      ui_store.sidebar_view = SIDEBAR_VIEWS.daily_notes;
      if (!ui_store.sidebar_open) {
        ui_store.sidebar_open = true;
      }
      const settings = ui_store.editor_settings;
      const path = await service.ensure_daily_note(
        settings.daily_notes_folder,
        settings.daily_note_name_format,
        new Date(),
      );
      if (path) {
        void registry.execute(ACTION_IDS.note_open, path);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.daily_notes_open_date,
    label: "Daily Notes: Open Date",
    execute: async (date: unknown) => {
      if (!(date instanceof Date)) return;
      const settings = ui_store.editor_settings;
      const path = await service.ensure_daily_note(
        settings.daily_notes_folder,
        settings.daily_note_name_format,
        date,
      );
      if (path) {
        void registry.execute(ACTION_IDS.note_open, path);
      }
    },
  });
}
