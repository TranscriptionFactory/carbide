import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type {
  ClipOutput,
  ClipResult,
} from "$lib/features/clip/application/clip_service";
import { is_valid_clip_url } from "$lib/features/clip/domain/clip_note";
import { toast } from "$lib/shared/ui/toast";

function success_message(result: ClipResult & { status: "clipped" }): string {
  const base =
    result.outputs.length > 1
      ? `Clipped page (${String(result.outputs.length)} formats)`
      : "Clipped page";
  if (result.images_failed > 0) {
    return `${base} — ${String(result.images_failed)} image${
      result.images_failed === 1 ? "" : "s"
    } could not be saved`;
  }
  return base;
}

export function register_clip_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  const when_vault_open = () => stores.vault.vault !== null;

  function close_dialog() {
    stores.ui.clip_web_page_dialog = {
      ...stores.ui.clip_web_page_dialog,
      open: false,
    };
  }

  async function open_primary(primary: ClipOutput) {
    if (primary.kind === "markdown") {
      await registry.execute(ACTION_IDS.note_open, primary.path);
      return;
    }
    await registry.execute(ACTION_IDS.document_open, {
      file_path: primary.path,
    });
  }

  registry.register({
    id: ACTION_IDS.clip_web_page,
    label: "Clip Web Page",
    when: when_vault_open,
    execute: () => {
      stores.ui.clip_web_page_dialog = {
        open: true,
        url: "",
        name: "",
        folder_path: stores.ui.selected_folder_path,
        formats: { markdown: true, html: false, epub: false },
      };
    },
  });

  registry.register({
    id: ACTION_IDS.clip_web_page_cancel,
    label: "Cancel Clip Web Page",
    execute: () => {
      close_dialog();
    },
  });

  registry.register({
    id: ACTION_IDS.clip_web_page_confirm,
    label: "Confirm Clip Web Page",
    when: when_vault_open,
    execute: async () => {
      const dialog = stores.ui.clip_web_page_dialog;
      const formats = { ...dialog.formats };
      if (
        !is_valid_clip_url(dialog.url) ||
        (!formats.markdown && !formats.html && !formats.epub)
      ) {
        return;
      }
      close_dialog();

      const attachment_folder =
        stores.ui.editor_settings.attachment_folder || ".assets";
      const loading_id = toast.loading("Clipping web page...");
      const result = await services.clip.clip_page({
        url: dialog.url,
        name: dialog.name,
        folder_path: dialog.folder_path,
        formats,
        attachment_folder,
      });
      toast.dismiss(loading_id);

      if (result.status === "failed") {
        toast.error(`Clip failed: ${result.error}`);
        return;
      }
      if (result.status === "skipped") {
        toast.error("No vault open");
        return;
      }
      toast.success(success_message(result));
      await open_primary(result.primary);
    },
  });
}
