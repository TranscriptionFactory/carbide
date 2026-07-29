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

const payload = { html: '<p data-pm-slice="0 0 []">x</p>', text: "x" };

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("editor_context_menu copy routing", () => {
  it("copies the selection snapshotted when the menu opened", () => {
    const exec = vi.fn(() => true);
    document.execCommand = exec as never;
    const menu = render_editor_context_menu({ payload });

    menu.state.block_selection = new Set([0]);
    menu.right_click();
    menu.click_item("Copy");

    expect(menu.editor.copy_blocks_payload).toHaveBeenCalledTimes(1);
    expect(menu.editor.copy_blocks_payload).toHaveBeenCalledWith(new Set([0]));
    expect(menu.clipboard.copy_rich).toHaveBeenCalledWith(payload);
    expect(exec).not.toHaveBeenCalled();

    menu.cleanup();
  });

  it("copies the right-clicked block when nothing is selected", () => {
    const exec = vi.fn(() => true);
    document.execCommand = exec as never;
    const menu = render_editor_context_menu({ payload, block_pos: 42 });

    menu.right_click();
    menu.click_item("Copy");

    expect(menu.editor.copy_blocks_payload).toHaveBeenCalledWith(new Set([42]));
    expect(menu.clipboard.copy_rich).toHaveBeenCalledWith(payload);
    expect(exec).not.toHaveBeenCalled();

    menu.cleanup();
  });

  it("copies nothing when neither a selection nor a block resolves", () => {
    const exec = vi.fn(() => true);
    document.execCommand = exec as never;
    const menu = render_editor_context_menu({ payload });

    menu.right_click();
    menu.click_item("Copy");

    expect(menu.editor.copy_blocks_payload).not.toHaveBeenCalled();
    expect(menu.clipboard.copy_rich).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();

    menu.cleanup();
  });
});
