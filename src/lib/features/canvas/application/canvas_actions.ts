import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { CanvasService } from "$lib/features/canvas/application/canvas_service";

export function register_canvas_actions(
  input: ActionRegistrationInput & {
    canvas_service: CanvasService;
  },
) {
  const { registry, stores, canvas_service } = input;

  registry.register({
    id: ACTION_IDS.canvas_open,
    label: "Open Canvas",
    execute: async (...args: unknown[]) => {
      const file_path = args[0] as string;
      if (typeof file_path !== "string") return;

      const last_slash = file_path.lastIndexOf("/");
      const filename =
        last_slash >= 0 ? file_path.slice(last_slash + 1) : file_path;
      const is_excalidraw = file_path.endsWith(".excalidraw");
      const file_type = is_excalidraw ? "excalidraw" : "canvas";

      const tab = stores.tab.open_document_tab(file_path, filename, file_type);
      await canvas_service.open_canvas(tab.id, file_path, file_type);
    },
  });

  registry.register({
    id: ACTION_IDS.canvas_close,
    label: "Close Canvas",
    execute: (...args: unknown[]) => {
      const tab_id = args[0] as string;
      canvas_service.close_canvas(tab_id);
    },
  });

  registry.register({
    id: ACTION_IDS.canvas_save,
    label: "Save Canvas",
    execute: async (...args: unknown[]) => {
      const tab_id = args[0] as string;
      await canvas_service.save_canvas(tab_id);
    },
  });

  registry.register({
    id: ACTION_IDS.canvas_create,
    label: "New Canvas",
    execute: async (...args: unknown[]) => {
      const file_path = args[0] as string;
      if (typeof file_path !== "string") return;
      const vault_id = stores.vault.vault?.id;
      if (!vault_id) return;
      await canvas_service.create_canvas(vault_id, file_path);
    },
  });

  registry.register({
    id: ACTION_IDS.canvas_create_drawing,
    label: "New Drawing",
    execute: async (...args: unknown[]) => {
      const file_path = args[0] as string;
      if (typeof file_path !== "string") return;
      const vault_id = stores.vault.vault?.id;
      if (!vault_id) return;
      await canvas_service.create_drawing(vault_id, file_path);
    },
  });
}
