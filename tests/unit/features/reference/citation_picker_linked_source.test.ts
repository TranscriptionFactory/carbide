import { describe, it, expect, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { CslItem } from "$lib/features/reference/types";

function make_linked_item(id: string, file_path: string): CslItem {
  return {
    id,
    type: "article-journal",
    title: `Title for ${id}`,
    _source: "linked_source",
    _linked_file_path: file_path,
  };
}

function make_regular_item(id: string): CslItem {
  return {
    id,
    type: "article-journal",
    title: `Title for ${id}`,
  };
}

function is_linked(item: CslItem): boolean {
  return item._source === "linked_source";
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

  async function handle_item_click(item: CslItem) {
    if (is_linked(item)) {
      await registry.execute("document.open", {
        file_path: item._linked_file_path,
      });
    } else {
      await registry.execute("reference.insert_citation", item.id);
    }
  }

  return { registry, document_open, insert_citation, handle_item_click };
}

describe("citation picker linked source click routing", () => {
  it("calls document.open with file_path for a linked source item", async () => {
    const { document_open, insert_citation, handle_item_click } =
      create_harness();
    const item = make_linked_item("smith2024", "/vault/papers/smith2024.pdf");

    await handle_item_click(item);

    expect(document_open).toHaveBeenCalledWith({
      file_path: "/vault/papers/smith2024.pdf",
    });
    expect(insert_citation).not.toHaveBeenCalled();
  });

  it("calls reference.insert_citation for a non-linked item", async () => {
    const { document_open, insert_citation, handle_item_click } =
      create_harness();
    const item = make_regular_item("doe2023");

    await handle_item_click(item);

    expect(insert_citation).toHaveBeenCalledWith("doe2023");
    expect(document_open).not.toHaveBeenCalled();
  });

  it("calls document.open for an HTML linked source item", async () => {
    const { document_open, insert_citation, handle_item_click } =
      create_harness();
    const item = make_linked_item("web2024", "/vault/sources/article.html");

    await handle_item_click(item);

    expect(document_open).toHaveBeenCalledWith({
      file_path: "/vault/sources/article.html",
    });
    expect(insert_citation).not.toHaveBeenCalled();
  });

  it("calls insert_citation for item with _source other than linked_source", async () => {
    const { document_open, insert_citation, handle_item_click } =
      create_harness();
    const item: CslItem = {
      id: "zotero2024",
      type: "article-journal",
      title: "Zotero Paper",
      _source: "zotero",
    };

    await handle_item_click(item);

    expect(insert_citation).toHaveBeenCalledWith("zotero2024");
    expect(document_open).not.toHaveBeenCalled();
  });
});
