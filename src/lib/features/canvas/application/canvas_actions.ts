import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { CanvasService } from "$lib/features/canvas/application/canvas_service";

function sanitize_canvas_name(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\.+$/, "");
}

function build_canvas_path(folder: string, name: string): string {
  const sanitized = sanitize_canvas_name(name);
  const base = sanitized || `Untitled ${Date.now()}`;
  const prefix = folder ? `${folder}/` : "";
  return `${prefix}${base}.excalidraw`;
}

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
      const vault_id = stores.vault.vault?.id;
      if (!vault_id) return;

      if (typeof args[0] === "string") {
        await canvas_service.create_drawing(vault_id, args[0]);
        await registry.execute(ACTION_IDS.canvas_open, args[0]);
        return;
      }

      stores.ui.create_canvas_dialog = {
        open: true,
        folder_path: "assets/excalidraw",
        canvas_name: "",
      };
    },
  });

  registry.register({
    id: ACTION_IDS.canvas_update_create_name,
    label: "Update Canvas Name",
    execute: (...args: unknown[]) => {
      const name = args[0] as string;
      if (typeof name !== "string") return;
      stores.ui.create_canvas_dialog = {
        ...stores.ui.create_canvas_dialog,
        canvas_name: name,
      };
    },
  });

  registry.register({
    id: ACTION_IDS.canvas_confirm_create,
    label: "Confirm Canvas Create",
    execute: async () => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id) return;

      const { folder_path, canvas_name } = stores.ui.create_canvas_dialog;
      const file_path = build_canvas_path(folder_path, canvas_name);

      stores.ui.create_canvas_dialog = {
        open: false,
        folder_path: "",
        canvas_name: "",
      };

      await canvas_service.create_drawing(vault_id, file_path);
      await registry.execute(ACTION_IDS.canvas_open, file_path);
    },
  });

  registry.register({
    id: ACTION_IDS.canvas_cancel_create,
    label: "Cancel Canvas Create",
    execute: () => {
      stores.ui.create_canvas_dialog = {
        open: false,
        folder_path: "",
        canvas_name: "",
      };
    },
  });

  registry.register({
    id: ACTION_IDS.canvas_repair_refs,
    label: "Repair Canvas References",
    execute: async (...args: unknown[]) => {
      const vault_id = stores.vault.vault?.id;
      if (!vault_id) return;
      const old_path = args[0] as string;
      const new_path = args[1] as string;
      if (typeof old_path !== "string" || typeof new_path !== "string") return;
      await canvas_service.repair_canvas_refs(vault_id, old_path, new_path);
    },
  });
}
