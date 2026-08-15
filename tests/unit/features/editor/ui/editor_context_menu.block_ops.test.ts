/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

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

    expect(menu.editor.block_pos_at_coords).toHaveBeenCalledWith(
      300,
      180,
      expect.any(HTMLElement),
    );
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

  it("does nothing when no block resolves under the pointer", () => {
    const menu = render_editor_context_menu({ block_pos: null });

    menu.right_click();
    menu.click_item("Delete");

    expect(menu.editor.delete_block_at).not.toHaveBeenCalled();
    expect(menu.editor.batch_delete).not.toHaveBeenCalled();
    expect(menu.execute).not.toHaveBeenCalled();

    menu.cleanup();
  });

  it("gives copy, duplicate and delete the same single target", () => {
    const menu = render_editor_context_menu({
      block_pos: 42,
      payload: { html: "<p>x</p>", text: "x" },
    });

    menu.state.block_selection = new Set([7]);
    menu.right_click();
    menu.click_item("Copy");
    menu.click_item("Duplicate");
    menu.click_item("Delete");

    expect(menu.editor.copy_blocks_payload).toHaveBeenCalledWith(new Set([42]));
    expect(menu.editor.duplicate_block_at).toHaveBeenCalledWith(42);
    expect(menu.editor.delete_block_at).toHaveBeenCalledWith(42);

    menu.cleanup();
  });
});

describe("editor_context_menu turn into routing", () => {
  it("converts the block under the pointer instead of the caret's block", () => {
    const menu = render_editor_context_menu({ block_pos: 42 });

    menu.right_click();
    menu.click_item("Heading 2");

    expect(menu.editor.turn_into_at).toHaveBeenCalledWith(
      "heading",
      { level: 2 },
      42,
    );
    expect(menu.execute).not.toHaveBeenCalled();
    expect(menu.editor.batch_turn_into).not.toHaveBeenCalled();

    menu.cleanup();
  });

  it("converts a single selected block when the pointer misses", () => {
    const menu = render_editor_context_menu({ block_pos: null });

    menu.state.block_selection = new Set([7]);
    menu.right_click();
    menu.click_item("Bullet List");

    expect(menu.editor.turn_into_at).toHaveBeenCalledWith(
      "bullet_list",
      undefined,
      7,
    );

    menu.cleanup();
  });

  it("still batches a multi-block selection", () => {
    const menu = render_editor_context_menu({ block_pos: 42 });

    menu.state.block_selection = new Set([4, 9]);
    menu.right_click();
    menu.click_item("Paragraph");

    expect(menu.editor.batch_turn_into).toHaveBeenCalledWith(
      "paragraph",
      undefined,
      new Set([4, 9]),
    );
    expect(menu.editor.turn_into_at).not.toHaveBeenCalled();
    expect(menu.editor.clear_block_selection).toHaveBeenCalledTimes(1);

    menu.cleanup();
  });

  it("does nothing when no block resolves", () => {
    const menu = render_editor_context_menu({ block_pos: null });

    menu.right_click();
    menu.click_item("Heading 1");

    expect(menu.editor.turn_into_at).not.toHaveBeenCalled();
    expect(menu.editor.batch_turn_into).not.toHaveBeenCalled();
    expect(menu.execute).not.toHaveBeenCalled();

    menu.cleanup();
  });

  it("gives turn into and delete the same single target", () => {
    const menu = render_editor_context_menu({ block_pos: 42 });

    menu.state.block_selection = new Set([7]);
    menu.right_click();
    menu.click_item("Heading 3");
    menu.click_item("Delete");

    expect(menu.editor.turn_into_at).toHaveBeenCalledWith(
      "heading",
      { level: 3 },
      42,
    );
    expect(menu.editor.delete_block_at).toHaveBeenCalledWith(42);

    menu.cleanup();
  });
});

describe("editor_context_menu insert routing", () => {
  it("inserts above the block under the pointer", () => {
    const menu = render_editor_context_menu({ block_pos: 42 });

    menu.right_click();
    menu.click_item("Insert Above");

    expect(menu.editor.insert_block_at).toHaveBeenCalledWith(42, "above");

    menu.cleanup();
  });

  it("inserts below the block under the pointer", () => {
    const menu = render_editor_context_menu({ block_pos: 42 });

    menu.right_click();
    menu.click_item("Insert Below");

    expect(menu.editor.insert_block_at).toHaveBeenCalledWith(42, "below");

    menu.cleanup();
  });

  it("inserts relative to a single selected block when the pointer misses", () => {
    const menu = render_editor_context_menu({ block_pos: null });

    menu.state.block_selection = new Set([7]);
    menu.right_click();
    menu.click_item("Insert Below");

    expect(menu.editor.insert_block_at).toHaveBeenCalledWith(7, "below");

    menu.cleanup();
  });

  it("does nothing when no block resolves", () => {
    const menu = render_editor_context_menu({ block_pos: null });

    menu.right_click();
    menu.click_item("Insert Above");

    expect(menu.editor.insert_block_at).not.toHaveBeenCalled();

    menu.cleanup();
  });
});
