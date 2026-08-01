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

import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { render_editor_context_menu } from "../../../helpers/editor_context_menu_harness";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function has_item(label: string): boolean {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).some((button) => button.textContent?.trim().startsWith(label));
}

describe("editor_context_menu block links", () => {
  it("copies a block link for the block under the pointer", () => {
    const menu = render_editor_context_menu({ block_pos: 42 });

    menu.right_click();
    menu.click_item("Copy Block Link");

    expect(menu.editor.block_supports_id_at).toHaveBeenCalledWith(42);
    expect(menu.execute).toHaveBeenCalledWith(
      ACTION_IDS.note_copy_block_link,
      42,
    );

    menu.cleanup();
  });

  it("copies a bare block id for the block under the pointer", () => {
    const menu = render_editor_context_menu({ block_pos: 42 });

    menu.right_click();
    menu.click_item("Copy Block ID");

    expect(menu.execute).toHaveBeenCalledWith(
      ACTION_IDS.note_copy_block_id,
      42,
    );

    menu.cleanup();
  });

  it("targets the single selected block when the pointer resolves nothing", () => {
    const menu = render_editor_context_menu({
      block_pos: null,
      block_selection: new Set([7]),
    });

    menu.right_click();
    menu.click_item("Copy Block Link");

    expect(menu.execute).toHaveBeenCalledWith(
      ACTION_IDS.note_copy_block_link,
      7,
    );

    menu.cleanup();
  });

  it("hides both items on a block that cannot carry an id", () => {
    const menu = render_editor_context_menu({
      block_pos: 42,
      supports_block_id: false,
    });

    menu.right_click();

    expect(has_item("Copy Block Link")).toBe(false);
    expect(has_item("Copy Block ID")).toBe(false);
    expect(has_item("Duplicate")).toBe(true);

    menu.cleanup();
  });

  it("hides both items when no block is resolved at all", () => {
    const menu = render_editor_context_menu({ block_pos: null });

    menu.right_click();

    expect(has_item("Copy Block Link")).toBe(false);
    expect(menu.editor.block_supports_id_at).not.toHaveBeenCalled();

    menu.cleanup();
  });
});
