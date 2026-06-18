import { describe, it, expect, vi } from "vitest";
import {
  build_search_graph_result_menu,
  type SearchGraphMenuItem,
} from "$lib/features/graph/domain/search_graph_result_menu";

const PATH = "work/note.md";

function find_item(
  items: SearchGraphMenuItem[],
  id: SearchGraphMenuItem["id"],
): SearchGraphMenuItem {
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error(`menu item "${id}" not found`);
  return item;
}

function all_callbacks() {
  return {
    on_open: vi.fn(),
    on_open_to_side: vi.fn(),
    on_copy_path: vi.fn(),
    on_reveal_in_file_manager: vi.fn(),
    on_open_in_default_app: vi.fn(),
    on_find_similar: vi.fn(),
    on_focus_node: vi.fn(),
  };
}

describe("build_search_graph_result_menu", () => {
  it("renders every expected item when all callbacks are provided", () => {
    const items = build_search_graph_result_menu(PATH, all_callbacks());
    expect(items.map((i) => i.id)).toEqual([
      "open",
      "open_to_side",
      "focus_node",
      "find_similar",
      "copy_path",
      "reveal_in_file_manager",
      "open_in_default_app",
    ]);
  });

  it("selecting each item fires its callback with the node path", () => {
    const cb = all_callbacks();
    const items = build_search_graph_result_menu(PATH, cb);
    for (const item of items) item.select();

    expect(cb.on_open).toHaveBeenCalledWith(PATH);
    expect(cb.on_open_to_side).toHaveBeenCalledWith(PATH);
    expect(cb.on_focus_node).toHaveBeenCalledWith(PATH);
    expect(cb.on_find_similar).toHaveBeenCalledWith(PATH);
    expect(cb.on_copy_path).toHaveBeenCalledWith(PATH);
    expect(cb.on_reveal_in_file_manager).toHaveBeenCalledWith(PATH);
    expect(cb.on_open_in_default_app).toHaveBeenCalledWith(PATH);
  });

  it("each select fires exactly one callback", () => {
    const cb = all_callbacks();
    const items = build_search_graph_result_menu(PATH, cb);
    find_item(items, "copy_path").select();

    expect(cb.on_copy_path).toHaveBeenCalledTimes(1);
    expect(cb.on_open).not.toHaveBeenCalled();
    expect(cb.on_reveal_in_file_manager).not.toHaveBeenCalled();
  });

  it("omits optional items whose callbacks are not provided", () => {
    const items = build_search_graph_result_menu(PATH, {
      on_open: vi.fn(),
    });
    expect(items.map((i) => i.id)).toEqual(["open"]);
  });

  it("groups graph and shell items behind separators", () => {
    const items = build_search_graph_result_menu(PATH, all_callbacks());
    expect(find_item(items, "focus_node").separator_before).toBe(true);
    expect(find_item(items, "copy_path").separator_before).toBe(true);
    expect(find_item(items, "open").separator_before).toBe(false);
  });
});
