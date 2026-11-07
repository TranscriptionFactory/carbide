import { describe, expect, it, vi } from "vitest";
import { NoteService } from "$lib/features/note/application/note_service";
import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import {
  create_mock_index_port,
  create_mock_notes_port,
} from "../helpers/mock_ports";
import { create_test_vault, create_test_note } from "../helpers/test_fixtures";
import type { AssetsPort } from "$lib/features/note/ports";
import type { EditorService } from "$lib/features/editor";

function harness() {
  const stores = create_app_stores();
  stores.vault.set_vault(create_test_vault());
  const port = {
    ...create_mock_notes_port(),
    copy_file: vi.fn().mockResolvedValue(undefined),
    pick_save_file_path: vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue("/output/note.txt"),
    confirm_file_overwrite: vi.fn().mockResolvedValue(false),
  };
  const index = create_mock_index_port();
  const service = new NoteService(
    port,
    index,
    {} as AssetsPort,
    stores.vault,
    stores.notes,
    stores.editor,
    stores.op,
    {} as EditorService,
    () => 1,
  );
  return { service, stores, port, index };
}

describe("saved file operations", () => {
  it("copies saved note bytes without changing its source, links, or index row", async () => {
    const { service, stores, port, index } = harness();
    const note = create_test_note("note", "Note");
    stores.notes.set_notes([note]);
    const index_before = structuredClone(index._calls);
    await service.save_file_as("note.md");
    expect(port.copy_file).toHaveBeenCalledExactlyOnceWith(
      "vault-1",
      "note.md",
      "/output/note.txt",
      false,
    );
    expect(stores.notes.notes).toEqual([note]);
    expect(port._calls.rename_note).toEqual([]);
    expect(port._calls.delete_note).toEqual([]);
    expect(port._calls.write_note).toEqual([]);
    expect(index._calls).toEqual(index_before);
  });
  it("does nothing when Save As is cancelled", async () => {
    const { service, port } = harness();
    port.pick_save_file_path.mockResolvedValue(null);
    await service.save_file_as("note.md");
    expect(port.copy_file).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "asks before overwriting, with confirmation %s",
    async (approved) => {
      const { service, port } = harness();
      port.copy_file.mockRejectedValueOnce(new Error("file already exists"));
      port.confirm_file_overwrite.mockResolvedValue(approved);
      await service.save_file_as("note.md");
      expect(port.confirm_file_overwrite).toHaveBeenCalledExactlyOnceWith(
        "/output/note.txt",
      );
      expect(port.copy_file).toHaveBeenCalledTimes(approved ? 2 : 1);
      if (approved)
        expect(port.copy_file).toHaveBeenLastCalledWith(
          "vault-1",
          "note.md",
          "/output/note.txt",
          true,
        );
      expect(port._calls.delete_note).toEqual([]);
    },
  );
  it("propagates copy failure without deleting source or destination", async () => {
    const { service, port } = harness();
    port.copy_file.mockRejectedValue(new Error("permission denied"));
    await expect(service.save_file_as("note.md")).rejects.toThrow(
      "permission denied",
    );
    expect(port.confirm_file_overwrite).not.toHaveBeenCalled();
    expect(port._calls.delete_note).toEqual([]);
  });
  it.each([
    ["docs/a.csv", "docs/a copy.csv", "docs/a copy 2.csv"],
    ["docs/.env", "docs/.env copy", "docs/.env copy 2"],
    ["README", "README copy", "README copy 2"],
  ])("duplicates %s without overwriting", async (source, first, second) => {
    const { service, port } = harness();
    port.copy_file.mockRejectedValueOnce(new Error("file already exists"));
    await service.duplicate_file(source);
    expect(port.copy_file.mock.calls).toEqual([
      ["vault-1", source, first, false],
      ["vault-1", source, second, false],
    ]);
  });
  it("uses the note deletion IO and index-removal path for PDFs", async () => {
    const { service, port, index } = harness();
    await service.delete_file("docs/a.pdf");
    expect(port._calls.delete_note).toEqual([
      { vault_id: "vault-1", note_id: "docs/a.pdf" },
    ]);
    expect(index._calls.remove_note).toEqual([
      { vault_id: "vault-1", note_id: "docs/a.pdf" },
    ]);
  });
  it("renames documents without invoking the delete-first overwrite fallback", async () => {
    const { service, port } = harness();
    await service.rename_file("a.csv", "b.tsv");
    expect(port._calls.rename_note).toEqual([
      { vault_id: "vault-1", from: "a.csv", to: "b.tsv" },
    ]);
    expect(port._calls.delete_note).toEqual([]);
  });
  it("blocks document-to-Markdown Rename but still permits a Markdown Save As copy", async () => {
    const { service, port } = harness();
    await expect(service.rename_file("a.csv", "a.MD")).rejects.toThrow(
      "Use Save As",
    );
    expect(port._calls.rename_note).toEqual([]);
    port.pick_save_file_path.mockResolvedValue("/output/a.md");
    await service.save_file_as("a.csv");
    expect(port.copy_file).toHaveBeenCalledExactlyOnceWith(
      "vault-1",
      "a.csv",
      "/output/a.md",
      false,
    );
  });
  it("rejects file actions that bypass Markdown note extension protection", async () => {
    const { service, port } = harness();
    await expect(service.rename_file("note.md", "note.txt")).rejects.toThrow(
      "Rename Note",
    );
    expect(port._calls.rename_note).toEqual([]);
  });
});
