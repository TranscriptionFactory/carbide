/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);
vi.mock(
  "$lib/components/ui/tooltip/index.js",
  async () => import("../../../helpers/ui_stubs/tooltip"),
);
vi.mock(
  "$lib/components/ui/context-menu",
  async () => import("../../../helpers/ui_stubs/context_menu"),
);

import { ACTION_IDS } from "$lib/app";
import {
  get_all_by_testid,
  get_by_testid,
  install_dom_stubs,
  make_note_meta,
  make_note_tab,
  render_tab_bar,
} from "./tab_bar_fixture";

beforeEach(() => {
  install_dom_stubs();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function is_disabled(element: HTMLElement | null): boolean {
  return element instanceof HTMLButtonElement && element.disabled;
}

describe("tab_bar.svelte context menu", () => {
  it("dispatches the close-family actions", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a"), make_note_tab("b")],
      active_tab_id: "a",
    });

    get_all_by_testid("tab-menu-close")[0]?.click();
    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_close, "a");

    get_all_by_testid("tab-menu-close-others")[0]?.click();
    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_close_other, "a");

    get_all_by_testid("tab-menu-close-right")[0]?.click();
    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_close_right, "a");

    get_all_by_testid("tab-menu-close-all")[0]?.click();
    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_close_all);

    view.cleanup();
  });

  it("disables Close Other Tabs with a single tab", () => {
    const view = render_tab_bar({ tabs: [make_note_tab("a")] });

    expect(is_disabled(get_by_testid("tab-menu-close-others"))).toBe(true);

    view.cleanup();
  });

  it("swaps pin and unpin by pinned state", () => {
    const pinned_view = render_tab_bar({
      tabs: [make_note_tab("a", { is_pinned: true })],
    });
    get_by_testid("tab-menu-pin")?.click();
    expect(pinned_view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_unpin, "a");
    pinned_view.cleanup();

    const unpinned_view = render_tab_bar({ tabs: [make_note_tab("a")] });
    get_by_testid("tab-menu-pin")?.click();
    expect(unpinned_view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_pin, "a");
    unpinned_view.cleanup();
  });

  it("dispatches copy-path and reveal with the tab id", () => {
    const view = render_tab_bar({ tabs: [make_note_tab("a")] });

    get_by_testid("tab-menu-copy-path")?.click();
    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_copy_path, "a");

    get_by_testid("tab-menu-reveal")?.click();
    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.tab_reveal_in_tree,
      "a",
    );

    view.cleanup();
  });

  it("dispatches open-to-side for a primary note tab", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a", { note_path: "notes/a.md" })],
    });

    get_by_testid("tab-menu-split")?.click();
    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.tab_open_to_side,
      "notes/a.md",
    );

    view.cleanup();
  });

  it("dispatches unsplit for a secondary tab", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a"), make_note_tab("b", { pane: "secondary" })],
      active_tab_id: "a",
    });

    get_all_by_testid("tab-menu-split")[1]?.click();
    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_toggle_split);

    view.cleanup();
  });

  it("dispatches detach-to-window with the note path", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a", { note_path: "notes/a.md" })],
    });

    get_by_testid("tab-menu-detach")?.click();
    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.window_open_viewer,
      "notes/a.md",
    );

    view.cleanup();
  });

  it("disables star, rename, and delete without note meta", () => {
    const view = render_tab_bar({ tabs: [make_note_tab("a")], notes: [] });

    expect(is_disabled(get_by_testid("tab-menu-star"))).toBe(true);
    expect(is_disabled(get_by_testid("tab-menu-rename"))).toBe(true);
    expect(is_disabled(get_by_testid("tab-menu-delete"))).toBe(true);

    view.cleanup();
  });

  it("dispatches star, rename, and delete with note meta present", () => {
    const meta = make_note_meta("notes/a.md");
    const view = render_tab_bar({
      tabs: [make_note_tab("a", { note_path: "notes/a.md" })],
      notes: [meta],
    });

    get_by_testid("tab-menu-star")?.click();
    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.note_toggle_star,
      "notes/a.md",
    );

    get_by_testid("tab-menu-rename")?.click();
    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.note_request_rename,
      meta,
    );

    get_by_testid("tab-menu-delete")?.click();
    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.note_request_delete,
      meta,
    );

    view.cleanup();
  });

  it("dispatches copy-markdown only for the active tab", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a"), make_note_tab("b")],
      active_tab_id: "a",
    });

    const items = get_all_by_testid("tab-menu-copy-markdown");
    expect(is_disabled(items[1] ?? null)).toBe(true);

    items[0]?.click();
    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.note_copy_markdown);

    view.cleanup();
  });
});
