import { describe, expect, it, vi } from "vitest";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { create_note_routing_harness } from "../helpers/note_routing_harness";

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

describe("note_open bare-string routing (graph open_node dispatch shape)", () => {
  it("opens a .md path in the editor", async () => {
    const { registry, document_open, services } = create_note_routing_harness();

    await registry.execute(ACTION_IDS.note_open, "notes/alpha.md");

    expect(services.note.open_note).toHaveBeenCalledWith(
      "notes/alpha.md",
      false,
      { cleanup_if_missing: false },
    );
    expect(document_open).not.toHaveBeenCalled();
  });

  it("routes a .pdf path to document_open", async () => {
    const { registry, document_open, services } = create_note_routing_harness();

    await registry.execute(ACTION_IDS.note_open, "docs/report.pdf");

    expect(document_open).toHaveBeenCalledWith({
      file_path: "docs/report.pdf",
    });
    expect(services.note.open_note).not.toHaveBeenCalled();
  });

  it("routes a .sh path to document_open", async () => {
    const { registry, document_open, services } = create_note_routing_harness();

    await registry.execute(ACTION_IDS.note_open, "scripts/setup.sh");

    expect(document_open).toHaveBeenCalledWith({
      file_path: "scripts/setup.sh",
    });
    expect(services.note.open_note).not.toHaveBeenCalled();
  });

  it("routes a linked non-md path to document_open with the resolved path", async () => {
    const { registry, document_open, services, resolve_linked_note_file_path } =
      create_note_routing_harness();

    resolve_linked_note_file_path.mockResolvedValue("/zotero/paper.pdf");

    await registry.execute(ACTION_IDS.note_open, "@linked/zotero/paper.pdf");

    expect(resolve_linked_note_file_path).toHaveBeenCalledWith(
      "@linked/zotero/paper.pdf",
    );
    expect(document_open).toHaveBeenCalledWith({
      file_path: "/zotero/paper.pdf",
    });
    expect(services.note.open_note).not.toHaveBeenCalled();
  });
});
