import { describe, expect, it, vi } from "vitest";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import { register_file_actions } from "$lib/features/note/application/file_actions";
import {
  build_file_path_from_name,
  build_note_path_from_name,
} from "$lib/features/note/application/note_action_helpers";
import { DocumentService } from "$lib/features/document";
import {
  create_open_note_state,
  create_test_note,
  create_test_vault,
} from "../helpers/test_fixtures";
import { build_command_context } from "$lib/features/search/domain/build_command_context";
import { COMMANDS_REGISTRY } from "$lib/features/search/domain/search_commands";
import { COMMAND_TO_ACTION_ID } from "$lib/features/search/application/omnibar_actions";

function harness() {
  const stores = create_app_stores();
  stores.vault.set_vault(create_test_vault());
  const registry = new ActionRegistry();
  const copy_markdown = vi.fn();
  registry.register({
    id: ACTION_IDS.note_copy_markdown,
    label: "Copy Markdown",
    execute: copy_markdown,
  });
  const note = {
    save_file_as: vi.fn().mockResolvedValue(undefined),
    duplicate_file: vi.fn().mockResolvedValue(undefined),
    rename_file: vi.fn().mockResolvedValue(undefined),
    delete_file: vi.fn().mockResolvedValue(undefined),
  };
  const port = {
    read_file: vi.fn().mockResolvedValue("saved"),
    write_file: vi.fn().mockResolvedValue(undefined),
    delete_file: vi.fn(),
    open_buffer: vi.fn(),
    read_buffer_window: vi.fn(),
    close_buffer: vi.fn().mockResolvedValue(undefined),
    resolve_asset_url: (_vault: string, path: string) => `asset://${path}`,
  };
  const document = new DocumentService(port, stores.vault, stores.document);
  const reconcile = vi.fn().mockResolvedValue(undefined);
  register_file_actions({
    registry,
    stores,
    services: { note, document },
    workspace_reconcile: reconcile,
  } as unknown as ActionRegistrationInput);
  return { stores, registry, note, document, port, copy_markdown, reconcile };
}

describe("file actions", () => {
  it("renames a CSV tab to TSV and preserves dirty edits, viewer state, conflict and MRU", async () => {
    const { stores, registry, note, document, port } = harness();
    stores.tab.open_document_tab("a.csv", "a.csv", "csv");
    await document.open_document("a.csv", "a.csv", "csv");
    stores.document.set_edited_content("a.csv", "dirty,cells");
    const viewer = stores.document.get_viewer_state("a.csv");
    const content = stores.document.get_content_state("a.csv");
    if (!viewer || !content) throw new Error("Missing loaded document state");
    stores.document.set_viewer_state("a.csv", { ...viewer, zoom: 1.5 });
    stores.document.mark_conflict("a.csv");
    stores.document.set_content_state("a.csv", {
      ...content,
      buffer_id: "old-buffer",
    });
    await registry.execute(ACTION_IDS.file_request_rename);
    expect(stores.ui.file_dialog.new_name).toBe("a.csv");
    await registry.execute(ACTION_IDS.file_update_name, "b.tsv");
    await registry.execute(ACTION_IDS.file_confirm);
    expect(note.rename_file).toHaveBeenCalledExactlyOnceWith("a.csv", "b.tsv");
    expect(stores.tab.active_tab).toMatchObject({
      id: "b.tsv",
      kind: "document",
      file_path: "b.tsv",
      file_type: "csv",
    });
    expect(stores.tab.mru_order).toEqual(["b.tsv"]);
    expect(stores.document.get_content_state("a.csv")).toBeUndefined();
    expect(stores.document.get_current_content("b.tsv")).toBe("dirty,cells");
    expect(stores.document.get_content_state("b.tsv")).toMatchObject({
      is_dirty: true,
      buffer_id: null,
      file_path: "b.tsv",
    });
    expect(stores.document.get_viewer_state("b.tsv")?.zoom).toBe(1.5);
    expect(stores.document.has_conflict("b.tsv")).toBe(true);
    expect(port.close_buffer).toHaveBeenCalledWith("old-buffer");
    await document.save("b.tsv");
    expect(port.write_file).toHaveBeenCalledExactlyOnceWith(
      "vault-1",
      "b.tsv",
      "dirty,cells",
    );
  });
  it("does not move tab or buffer state when rename fails", async () => {
    const { stores, registry, note, document } = harness();
    stores.tab.open_document_tab("a.csv", "a", "csv");
    await document.open_document("a.csv", "a.csv", "csv");
    stores.document.set_edited_content("a.csv", "dirty");
    note.rename_file.mockRejectedValue(new Error("note already exists"));
    await registry.execute(ACTION_IDS.file_request_rename);
    await registry.execute(ACTION_IDS.file_update_name, "b.tsv");
    await registry.execute(ACTION_IDS.file_confirm);
    expect(stores.tab.active_tab?.id).toBe("a.csv");
    expect(stores.document.get_current_content("a.csv")).toBe("dirty");
    expect(stores.ui.file_dialog.error).toBe("note already exists");
    expect(note.delete_file).not.toHaveBeenCalled();
  });
  it("requires delete confirmation, closes the deleted PDF tab and removes runtime state", async () => {
    const { stores, registry, note, document } = harness();
    stores.tab.open_document_tab("a.pdf", "a", "pdf");
    await document.open_document("a.pdf", "a.pdf", "pdf");
    await registry.execute(ACTION_IDS.file_request_delete);
    expect(stores.ui.file_dialog.mode).toBe("delete");
    expect(note.delete_file).not.toHaveBeenCalled();
    await registry.execute(ACTION_IDS.file_cancel);
    expect(note.delete_file).not.toHaveBeenCalled();
    await registry.execute(ACTION_IDS.file_request_delete);
    await registry.execute(ACTION_IDS.file_confirm);
    expect(note.delete_file).toHaveBeenCalledExactlyOnceWith("a.pdf");
    expect(stores.tab.tabs).toEqual([]);
    expect(stores.document.get_viewer_state("a.pdf")).toBeUndefined();
  });
  it("restores the next note's cached unsaved edits after deleting the active document", async () => {
    const { stores, registry } = harness();
    const meta = create_test_note("draft", "Draft");
    const cached = {
      ...create_open_note_state(meta, "unsaved note edits"),
      is_dirty: true,
    };
    const tab = stores.tab.open_tab(meta.path, meta.title);
    stores.tab.set_cached_note(tab.id, cached);
    stores.tab.set_dirty(tab.id, true);
    stores.tab.open_document_tab("a.pdf", "a", "pdf");
    await registry.execute(ACTION_IDS.file_request_delete);
    await registry.execute(ACTION_IDS.file_confirm);
    expect(stores.tab.active_tab?.id).toBe(tab.id);
    expect(stores.editor.open_note).toMatchObject({
      markdown: "unsaved note edits",
      is_dirty: true,
    });
    expect(stores.ui.file_dialog.mode).toBeNull();
  });
  it("keeps tab and buffer after failed deletion", async () => {
    const { stores, registry, note, document } = harness();
    stores.tab.open_document_tab("a.pdf", "a", "pdf");
    await document.open_document("a.pdf", "a.pdf", "pdf");
    note.delete_file.mockRejectedValue(new Error("permission denied"));
    await registry.execute(ACTION_IDS.file_request_delete);
    await registry.execute(ACTION_IDS.file_confirm);
    expect(stores.tab.active_tab?.id).toBe("a.pdf");
    expect(stores.document.get_viewer_state("a.pdf")).toBeDefined();
    expect(stores.ui.file_dialog.error).toBe("permission denied");
  });
  it("makes Copy Markdown unavailable and non-executable for document tabs despite a stale note", async () => {
    const { stores, registry, copy_markdown } = harness();
    stores.tab.open_document_tab("a.pdf", "a", "pdf");
    await registry.execute(ACTION_IDS.note_copy_markdown);
    expect(
      registry
        .get_available()
        .some((a) => a.id === ACTION_IDS.note_copy_markdown),
    ).toBe(false);
    expect(copy_markdown).not.toHaveBeenCalled();
    stores.tab.open_tab("note.md" as never, "Note");
    await registry.execute(ACTION_IDS.note_copy_markdown);
    expect(copy_markdown).toHaveBeenCalledOnce();
  });
  it("dispatches active-document palette commands through file actions", async () => {
    const { stores, registry, note } = harness();
    stores.tab.open_document_tab("a.pdf", "a", "pdf");
    const context = build_command_context(stores);
    for (const id of [
      "save_file_as",
      "duplicate_file",
      "rename_file",
      "delete_file",
    ]) {
      expect(
        COMMANDS_REGISTRY.find((command) => command.id === id)?.when?.(context),
      ).toBe(true);
    }
    expect(COMMAND_TO_ACTION_ID.save_file_as).toBe(ACTION_IDS.file_save_as);
    expect(COMMAND_TO_ACTION_ID.duplicate_file).toBe(ACTION_IDS.file_duplicate);
    await registry.execute(ACTION_IDS.file_save_as);
    await registry.execute(ACTION_IDS.file_duplicate);
    expect(note.save_file_as).toHaveBeenCalledExactlyOnceWith("a.pdf");
    expect(note.duplicate_file).toHaveBeenCalledExactlyOnceWith("a.pdf");
    stores.tab.open_tab("note.md" as never, "Note");
    const note_context = build_command_context(stores);
    expect(
      COMMANDS_REGISTRY.find((command) => command.id === "rename_file")?.when?.(
        note_context,
      ),
    ).toBe(false);
    await registry.execute(ACTION_IDS.file_request_rename, "note.md");
    expect(stores.ui.file_dialog.mode).toBeNull();
  });
});

describe("full filenames", () => {
  it.each(["b.tsv", ".env", "README", "report.final.pdf"])(
    "preserves %s",
    (name) => {
      expect(build_file_path_from_name("docs/a.csv", name)).toBe(
        `docs/${name}`,
      );
    },
  );
  it.each([
    "",
    ".",
    "..",
    "../b.tsv",
    "a/b.tsv",
    "a\\b.tsv",
    "bad\u0000name",
    "name.",
    "name ",
  ])("rejects unsafe %j", (name) => {
    expect(() => build_file_path_from_name("a.csv", name)).toThrow();
  });
  it("keeps note Rename constrained to Markdown", () => {
    expect(build_note_path_from_name("docs", "note.txt")).toBe(
      "docs/note.txt.md",
    );
  });
});
