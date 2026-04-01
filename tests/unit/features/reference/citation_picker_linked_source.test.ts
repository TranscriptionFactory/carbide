import { describe, it, expect, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { CslItem, LinkedNoteInfo } from "$lib/features/reference/types";

function make_library_item(id: string): CslItem {
  return {
    id,
    type: "article-journal",
    title: `Title for ${id}`,
  };
}

function make_linked_note(
  path: string,
  external_file_path: string,
): LinkedNoteInfo {
  return {
    path,
    title: `Title for ${path}`,
    mtime_ms: 1000,
    external_file_path,
  };
}

function create_harness() {
  const registry = new ActionRegistry();
  const document_open = vi.fn().mockResolvedValue(undefined);
  const insert_citation = vi.fn().mockResolvedValue(undefined);

  registry.register({
    id: "document.open",
    label: "Open Document",
    execute: document_open,
  });

  registry.register({
    id: "reference.insert_citation",
    label: "Insert Citation",
    execute: insert_citation,
  });

  async function handle_library_item_click(item: CslItem) {
    await registry.execute("reference.insert_citation", item.id);
  }

  async function handle_linked_note_click(note: LinkedNoteInfo) {
    if (note.external_file_path) {
      await registry.execute("document.open", {
        file_path: note.external_file_path,
      });
    }
  }

  return {
    registry,
    document_open,
    insert_citation,
    handle_library_item_click,
    handle_linked_note_click,
  };
}

describe("citation picker click routing", () => {
  it("inserts citation for a library item", async () => {
    const { insert_citation, document_open, handle_library_item_click } =
      create_harness();
    const item = make_library_item("doe2023");

    await handle_library_item_click(item);

    expect(insert_citation).toHaveBeenCalledWith("doe2023");
    expect(document_open).not.toHaveBeenCalled();
  });

  it("opens file for a linked note", async () => {
    const { document_open, insert_citation, handle_linked_note_click } =
      create_harness();
    const note = make_linked_note(
      "@linked/Papers/smith2024.pdf",
      "/vault/papers/smith2024.pdf",
    );

    await handle_linked_note_click(note);

    expect(document_open).toHaveBeenCalledWith({
      file_path: "/vault/papers/smith2024.pdf",
    });
    expect(insert_citation).not.toHaveBeenCalled();
  });

  it("opens file for an HTML linked note", async () => {
    const { document_open, insert_citation, handle_linked_note_click } =
      create_harness();
    const note = make_linked_note(
      "@linked/Sources/article.html",
      "/vault/sources/article.html",
    );

    await handle_linked_note_click(note);

    expect(document_open).toHaveBeenCalledWith({
      file_path: "/vault/sources/article.html",
    });
    expect(insert_citation).not.toHaveBeenCalled();
  });
});
