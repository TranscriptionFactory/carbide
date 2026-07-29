/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);
vi.mock(
  "$lib/components/ui/context-menu",
  async () => import("../../../helpers/ui_stubs/context_menu_full"),
);

import { render_editor_context_menu } from "../../../helpers/editor_context_menu_harness";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("editor_context_menu block ops routing", () => {
  it("deletes the block under the pointer, not the block under the caret", () => {
    const menu = render_editor_context_menu({ block_pos: 42 });

    menu.right_click({ x: 300, y: 180 });
    menu.click_item("Delete");

    expect(menu.editor.block_pos_at_coords).toHaveBeenCalledWith(300, 180);
    expect(menu.editor.delete_block_at).toHaveBeenCalledWith(42);
    expect(menu.execute).not.toHaveBeenCalled();

    menu.cleanup();
  });

  it("duplicates the block under the pointer", () => {
    const menu = render_editor_context_menu({ block_pos: 42 });

    menu.right_click();
    menu.click_item("Duplicate");

    expect(menu.editor.duplicate_block_at).toHaveBeenCalledWith(42);
    expect(menu.execute).not.toHaveBeenCalled();

    menu.cleanup();
  });

  it("reads the block selection when the menu opens, not when it mounts", () => {
    const menu = render_editor_context_menu({ block_pos: 42 });

    menu.state.block_selection = new Set([4, 9]);
    menu.right_click();
    menu.click_item("Delete");

    expect(menu.editor.batch_delete).toHaveBeenCalledWith(new Set([4, 9]));
    expect(menu.editor.clear_block_selection).toHaveBeenCalledTimes(1);
    expect(menu.editor.delete_block_at).not.toHaveBeenCalled();

    menu.cleanup();
  });

  it("falls back to the caret action when no block resolves under the pointer", () => {
    const menu = render_editor_context_menu({ block_pos: null });

    menu.right_click();
    menu.click_item("Delete");

    expect(menu.editor.delete_block_at).not.toHaveBeenCalled();
    expect(menu.execute).toHaveBeenCalledWith(ACTION_IDS.editor_delete_block);

    menu.cleanup();
  });
});
