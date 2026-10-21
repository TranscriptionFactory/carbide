import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_document_actions } from "$lib/features/document/application/document_actions";
import { DocumentStore } from "$lib/features/document";
import { CanvasStore } from "$lib/features/canvas";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { as_note_path } from "$lib/shared/types/ids";
import { DEFAULT_PDF_EXPORT_OPTIONS } from "$lib/shared/types/pdf_export";
import {
  create_open_note_state,
  create_test_note,
  create_test_vault,
} from "../helpers/test_fixtures";

vi.mock("svelte-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn().mockReturnValue("toast-id"),
    dismiss: vi.fn(),
  },
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(() => Promise.resolve(true)),
    render: vi.fn(() => Promise.resolve({ svg: "<svg></svg>" })),
  },
}));

const MARKDOWN = "# Heading\n\nSome **bold** prose.";

function create_harness({ with_open_note = true } = {}) {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    vault: new VaultStore(),
    editor: new EditorStore(),
    tab: new TabStore(),
    document: new DocumentStore(),
  };
  stores.vault.set_vault(create_test_vault());

  if (with_open_note) {
    const note = create_test_note("notes/alpha", "Alpha Note");
    stores.tab.open_tab(as_note_path("notes/alpha.md"), "Alpha Note");
    stores.editor.set_open_note(create_open_note_state(note, MARKDOWN));
  }

  const document_service = {
    export_note_pdf: vi.fn().mockResolvedValue(undefined),
    export_note_html: vi.fn().mockResolvedValue(undefined),
    export_note_epub: vi.fn().mockResolvedValue(undefined),
  };
  const services = {
    clipboard: { copy_rich: vi.fn() },
    editor: {},
    settings: {
      save_settings: vi.fn().mockResolvedValue({ status: "success" }),
    },
  };

  register_document_actions({
    registry,
    stores: stores as never,
    services: services as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
    document_service: document_service as never,
    document_store: stores.document,
    canvas_store: new CanvasStore(),
  });

  return { registry, stores, services, document_service };
}

describe("document export actions", () => {
  it("exports the open note as HTML", async () => {
    const { registry, document_service } = create_harness();

    await registry.execute(ACTION_IDS.document_export_html);

    expect(document_service.export_note_html).toHaveBeenCalledOnce();
    const [title, markdown] = document_service.export_note_html.mock
      .calls[0] as [string, string];
    expect(title).toBe("Alpha Note");
    expect(markdown).toBe(MARKDOWN);
  });

  it("exports the open note as EPUB with a vault-relative asset resolver", async () => {
    const { registry, document_service } = create_harness();

    await registry.execute(ACTION_IDS.document_export_epub);

    const [title, , resolve_asset_path] = document_service.export_note_epub.mock
      .calls[0] as [
      string,
      string,
      (src: string, kind: "canonical" | "wiki") => string | null,
    ];
    expect(title).toBe("Alpha Note");
    expect(resolve_asset_path(".assets/pic.png", "canonical")).toBe(
      "notes/.assets/pic.png",
    );
    expect(resolve_asset_path("https://x.test/a.png", "canonical")).toBeNull();
  });

  it("does nothing when no note tab is active", async () => {
    const { registry, stores, document_service } = create_harness({
      with_open_note: false,
    });

    await registry.execute(ACTION_IDS.document_export_html);
    await registry.execute(ACTION_IDS.document_export_epub);
    await registry.execute(ACTION_IDS.document_export_pdf);

    expect(document_service.export_note_html).not.toHaveBeenCalled();
    expect(document_service.export_note_epub).not.toHaveBeenCalled();
    expect(document_service.export_note_pdf).not.toHaveBeenCalled();
    expect(stores.ui.pdf_export_dialog.open).toBe(false);
  });

  it("surfaces an export failure as a toast instead of an unhandled rejection", async () => {
    const { registry, document_service } = create_harness();
    document_service.export_note_html.mockRejectedValue(new Error("disk full"));
    const { toast } = await import("svelte-sonner");

    await registry.execute(ACTION_IDS.document_export_html);

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to export as HTML"),
    );
  });
});

describe("PDF export dialog", () => {
  const LETTER_LANDSCAPE = {
    ...DEFAULT_PDF_EXPORT_OPTIONS,
    page_size: "letter",
    landscape: true,
  } as const;

  it("opens the dialog with the remembered options instead of exporting", async () => {
    const { registry, stores, document_service } = create_harness();
    stores.ui.editor_settings.pdf_export = { ...LETTER_LANDSCAPE };

    await registry.execute(ACTION_IDS.document_export_pdf);

    expect(stores.ui.pdf_export_dialog).toEqual({
      open: true,
      options: LETTER_LANDSCAPE,
    });
    expect(document_service.export_note_pdf).not.toHaveBeenCalled();
  });

  it("exports with the dialog options and remembers them", async () => {
    const { registry, stores, services, document_service } = create_harness();
    await registry.execute(ACTION_IDS.document_export_pdf);
    stores.ui.pdf_export_dialog.options = { ...LETTER_LANDSCAPE };

    await registry.execute(ACTION_IDS.document_export_pdf_confirm);

    expect(stores.ui.pdf_export_dialog.open).toBe(false);
    const [title, markdown, options] = document_service.export_note_pdf.mock
      .calls[0] as [string, string, unknown];
    expect(title).toBe("Alpha Note");
    expect(markdown).toBe(MARKDOWN);
    expect(options).toEqual(LETTER_LANDSCAPE);
    expect(services.settings.save_settings).toHaveBeenCalledWith(
      expect.objectContaining({ pdf_export: LETTER_LANDSCAPE }),
    );
    expect(stores.ui.editor_settings.pdf_export).toEqual(LETTER_LANDSCAPE);
  });

  it("closes the dialog on cancel without exporting", async () => {
    const { registry, stores, services, document_service } = create_harness();
    await registry.execute(ACTION_IDS.document_export_pdf);

    await registry.execute(ACTION_IDS.document_export_pdf_cancel);

    expect(stores.ui.pdf_export_dialog.open).toBe(false);
    expect(document_service.export_note_pdf).not.toHaveBeenCalled();
    expect(services.settings.save_settings).not.toHaveBeenCalled();
  });
});

describe("note.copy_html", () => {
  it("copies the rendered body as HTML alongside the markdown text", async () => {
    const { registry, services } = create_harness();

    await registry.execute(ACTION_IDS.note_copy_html);

    expect(services.clipboard.copy_rich).toHaveBeenCalledOnce();
    const [payload] = services.clipboard.copy_rich.mock.calls[0] as [
      { html: string; text: string },
    ];
    expect(payload.text).toBe(MARKDOWN);
    expect(payload.html).toContain('<h1 class="doc-title">Alpha Note</h1>');
    expect(payload.html).toContain("<strong>bold</strong>");
    expect(payload.html).not.toContain("<!doctype html>");
  });

  it("does nothing when no note is open", async () => {
    const { registry, services } = create_harness({ with_open_note: false });

    await registry.execute(ACTION_IDS.note_copy_html);

    expect(services.clipboard.copy_rich).not.toHaveBeenCalled();
  });
});
