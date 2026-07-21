import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type {
  ClipOutput,
  ClipRequest,
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

  async function handle_clip_result(result: ClipResult, request: ClipRequest) {
    if (result.status === "failed") {
      if (result.kind === "blocked" && request.source !== "capture") {
        toast.error(`Clip failed: ${result.error}`, {
          duration: 15000,
          action: {
            label: "Open in capture window",
            onClick: () => void start_capture_flow(request),
          },
        });
        return;
      }
      toast.error(`Clip failed: ${result.error}`);
      return;
    }
    if (result.status === "skipped") {
      toast.error("No vault open");
      return;
    }
    toast.success(success_message(result));
    await open_primary(result.primary);
  }

  async function start_capture_flow(request: ClipRequest) {
    try {
      await services.clip.capture_start(request.url);
    } catch (error) {
      toast.error(`Capture failed: ${String(error)}`);
      return;
    }

    const capture_request: ClipRequest = { ...request, source: "capture" };
    let settled = false;
    let pending_toast: string | number = "";
    const settle = () => {
      if (settled) return false;
      settled = true;
      unlisten();
      toast.dismiss(pending_toast);
      return true;
    };
    const unlisten = await services.clip.on_capture_closed(() => {
      settle();
    });

    const capture_page = () => {
      if (!settle()) return;
      void (async () => {
        const loading_id = toast.loading("Capturing page...");
        const result = await services.clip.clip_page(capture_request);
        toast.dismiss(loading_id);
        await handle_clip_result(result, capture_request);
      })();
    };

    const cancel_capture = () => {
      if (settle()) void services.clip.capture_cancel();
    };

    pending_toast = toast("Capture window open — solve any challenge first", {
      classes: { toast: "toast--stacked-actions" },
      duration: Infinity,
      action: { label: "Capture page", onClick: capture_page },
      cancel: { label: "Cancel", onClick: cancel_capture },
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
        capture: false,
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

      const request: ClipRequest = {
        url: dialog.url,
        name: dialog.name,
        folder_path: dialog.folder_path,
        formats,
        attachment_folder:
          stores.ui.editor_settings.attachment_folder || ".assets",
      };

      if (dialog.capture) {
        await start_capture_flow(request);
        return;
      }

      const loading_id = toast.loading("Clipping web page...");
      const result = await services.clip.clip_page(request);
      toast.dismiss(loading_id);
      await handle_clip_result(result, request);
    },
  });
}
