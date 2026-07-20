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
  install_dom_stubs,
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

function press(element: HTMLElement, key: string) {
  element.focus();
  element.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

describe("tab_bar.svelte keyboard", () => {
  it("keeps every tab focusable", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a"), make_note_tab("b")],
    });

    for (const tab of get_all_by_testid("tab-bar-tab")) {
      expect(tab.getAttribute("tabindex")).toBe("0");
    }

    view.cleanup();
  });

  it("dispatches tab_activate on Enter", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a"), make_note_tab("b")],
      active_tab_id: "a",
    });

    const tabs = get_all_by_testid("tab-bar-tab");
    if (!tabs[1]) throw new Error("expected second tab");
    press(tabs[1], "Enter");

    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_activate, "b");

    view.cleanup();
  });

  it("dispatches tab_activate on Space", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a"), make_note_tab("b")],
      active_tab_id: "a",
    });

    const tabs = get_all_by_testid("tab-bar-tab");
    if (!tabs[1]) throw new Error("expected second tab");
    press(tabs[1], " ");

    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_activate, "b");

    view.cleanup();
  });

  it("does not dispatch on Enter for the already-active tab", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a")],
      active_tab_id: "a",
    });

    const tabs = get_all_by_testid("tab-bar-tab");
    if (!tabs[0]) throw new Error("expected tab");
    press(tabs[0], "Enter");

    expect(view.execute).not.toHaveBeenCalled();

    view.cleanup();
  });
});
