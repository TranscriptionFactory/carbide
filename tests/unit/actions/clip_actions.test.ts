import { describe, expect, it, vi, beforeEach } from "vitest";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type {
  ActionRegistry,
  AppAction,
} from "$lib/app/action_registry/action_registry";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { register_clip_actions } from "$lib/features/clip/application/clip_actions";
import { toast } from "svelte-sonner";

vi.mock("svelte-sonner", () => {
  const toast = Object.assign(vi.fn().mockReturnValue("pending-toast"), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn().mockReturnValue("loading-toast"),
    dismiss: vi.fn(),
  });
  return { toast };
});

const mocked_toast = vi.mocked(toast);

type ToastOptions = {
  action?: { label: string; onClick: () => void };
  cancel?: { label: string; onClick: () => void };
};

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function create_harness() {
  const actions = new Map<string, AppAction>();
  const registry = {
    register(action: AppAction) {
      actions.set(action.id, action);
    },
    execute: vi.fn().mockResolvedValue(undefined),
  } as unknown as ActionRegistry;

  let closed_handler: (() => void) | null = null;
  const unlisten = vi.fn();
  const clip_service = {
    clip_page: vi.fn().mockResolvedValue({
      status: "clipped",
      outputs: [{ kind: "markdown", path: "clips/a.md" }],
      primary: { kind: "markdown", path: "clips/a.md" },
      images_total: 0,
      images_failed: 0,
    }),
    capture_start: vi.fn().mockResolvedValue(undefined),
    capture_cancel: vi.fn().mockResolvedValue(undefined),
    on_capture_closed: vi.fn().mockImplementation((handler: () => void) => {
      closed_handler = handler;
      return Promise.resolve(unlisten);
    }),
  };

  const stores = {
    vault: { vault: { id: "vault-1" } },
    ui: {
      selected_folder_path: "",
      editor_settings: { attachment_folder: ".assets" },
      clip_web_page_dialog: {
        open: true,
        url: "https://example.com/post",
        name: "",
        folder_path: "clips",
        formats: { markdown: true, html: false, epub: false },
        capture: false,
      },
    },
  };

  register_clip_actions({
    registry,
    stores,
    services: { clip: clip_service },
  } as unknown as ActionRegistrationInput);

  return {
    actions,
    registry,
    clip_service,
    stores,
    unlisten,
    emit_capture_closed: () => closed_handler?.(),
  };
}

function confirm(harness: ReturnType<typeof create_harness>) {
  const action = harness.actions.get(ACTION_IDS.clip_web_page_confirm);
  if (!action) throw new Error("confirm action not registered");
  return action.execute(undefined);
}

function pending_toast_options(): ToastOptions {
  const call = mocked_toast.mock.calls.at(-1);
  if (!call) throw new Error("pending capture toast not shown");
  return call[1] as ToastOptions;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("clip actions capture flow", () => {
  it("clips via fetch by default without opening a capture window", async () => {
    const harness = create_harness();
    await confirm(harness);

    expect(harness.clip_service.clip_page).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/post" }),
    );
    expect(harness.clip_service.capture_start).not.toHaveBeenCalled();
    expect(mocked_toast.success).toHaveBeenCalled();
  });

  it("offers the capture window on a blocked fetch error", async () => {
    const harness = create_harness();
    harness.clip_service.clip_page.mockResolvedValueOnce({
      status: "failed",
      error: "Site blocked the request (429)",
      kind: "blocked",
    });

    await confirm(harness);

    const options = mocked_toast.error.mock.calls[0]?.[1] as ToastOptions;
    expect(options.action?.label).toBe("Open in capture window");

    options.action?.onClick();
    await flush();
    expect(harness.clip_service.capture_start).toHaveBeenCalledWith(
      "https://example.com/post",
    );
  });

  it("does not offer capture for non-blocked failures", async () => {
    const harness = create_harness();
    harness.clip_service.clip_page.mockResolvedValueOnce({
      status: "failed",
      error: "Request failed with status 404 Not Found",
      kind: "other",
    });

    await confirm(harness);

    const options = mocked_toast.error.mock.calls[0]?.[1] as
      | ToastOptions
      | undefined;
    expect(options?.action).toBeUndefined();
  });

  it("skips the fetch when the dialog capture checkbox is set", async () => {
    const harness = create_harness();
    harness.stores.ui.clip_web_page_dialog.capture = true;

    await confirm(harness);

    expect(harness.clip_service.capture_start).toHaveBeenCalledWith(
      "https://example.com/post",
    );
    expect(harness.clip_service.clip_page).not.toHaveBeenCalled();
  });

  it("clips with source capture when the user captures the page", async () => {
    const harness = create_harness();
    harness.stores.ui.clip_web_page_dialog.capture = true;
    await confirm(harness);

    pending_toast_options().action?.onClick();
    await flush();

    expect(harness.clip_service.clip_page).toHaveBeenCalledWith(
      expect.objectContaining({ source: "capture" }),
    );
    expect(harness.unlisten).toHaveBeenCalled();
    expect(mocked_toast.success).toHaveBeenCalled();
  });

  it("cancels the capture window without clipping", async () => {
    const harness = create_harness();
    harness.stores.ui.clip_web_page_dialog.capture = true;
    await confirm(harness);

    pending_toast_options().cancel?.onClick();
    await flush();

    expect(harness.clip_service.capture_cancel).toHaveBeenCalled();
    expect(harness.clip_service.clip_page).not.toHaveBeenCalled();
    expect(harness.unlisten).toHaveBeenCalled();
  });

  it("dismisses the pending capture UI when the window is closed", async () => {
    const harness = create_harness();
    harness.stores.ui.clip_web_page_dialog.capture = true;
    await confirm(harness);

    harness.emit_capture_closed();
    await flush();

    expect(mocked_toast.dismiss).toHaveBeenCalledWith("pending-toast");
    expect(harness.clip_service.clip_page).not.toHaveBeenCalled();
    expect(harness.unlisten).toHaveBeenCalled();
  });

  it("capture click after the window closed does nothing", async () => {
    const harness = create_harness();
    harness.stores.ui.clip_web_page_dialog.capture = true;
    await confirm(harness);

    const options = pending_toast_options();
    harness.emit_capture_closed();
    options.action?.onClick();
    await flush();

    expect(harness.clip_service.clip_page).not.toHaveBeenCalled();
  });
});
