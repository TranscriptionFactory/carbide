/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "../../../helpers/svelte_client_runtime";

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

describe("tab_bar.svelte", () => {
  it("renders nothing without tabs", () => {
    const view = render_tab_bar({ tabs: [] });

    expect(get_by_testid("tab-bar")).toBeNull();

    view.cleanup();
  });

  it("renders one tab element per tab with titles", () => {
    const view = render_tab_bar({
      tabs: [
        make_note_tab("a", { title: "Alpha" }),
        make_note_tab("b", { title: "Beta" }),
      ],
    });

    const tabs = get_all_by_testid("tab-bar-tab");
    expect(tabs).toHaveLength(2);
    expect(tabs.map((t) => t.getAttribute("data-tab-id"))).toEqual(["a", "b"]);
    expect(tabs[0]?.textContent).toContain("Alpha");
    expect(tabs[1]?.textContent).toContain("Beta");

    view.cleanup();
  });

  it("marks only the active tab aria-selected", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a"), make_note_tab("b")],
      active_tab_id: "b",
    });

    const tabs = get_all_by_testid("tab-bar-tab");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("false");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");

    view.cleanup();
  });

  it("shows the dirty dot only on dirty tabs", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a", { is_dirty: true }), make_note_tab("b")],
    });

    const tabs = get_all_by_testid("tab-bar-tab");
    expect(tabs[0]?.querySelector(".TabBar__dirty-dot")).not.toBeNull();
    expect(tabs[1]?.querySelector(".TabBar__dirty-dot")).toBeNull();

    view.cleanup();
  });

  it("renders the pin divider between pinned and unpinned groups", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a", { is_pinned: true }), make_note_tab("b")],
    });

    expect(document.body.querySelector(".TabBar__pin-divider")).not.toBeNull();

    view.cleanup();
  });

  it("dispatches tab_close from the close button", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a"), make_note_tab("b")],
      active_tab_id: "a",
    });

    const close_buttons = get_all_by_testid("tab-bar-close");
    close_buttons[1]?.click();

    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_close, "b");

    view.cleanup();
  });

  it("dispatches tab_close on middle-click", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a"), make_note_tab("b")],
      active_tab_id: "a",
    });

    const tabs = get_all_by_testid("tab-bar-tab");
    tabs[1]?.dispatchEvent(
      new MouseEvent("auxclick", { button: 1, bubbles: true }),
    );

    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_close, "b");

    view.cleanup();
  });

  it("dispatches tab_activate when clicking an inactive tab", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a"), make_note_tab("b")],
      active_tab_id: "a",
    });

    const tabs = get_all_by_testid("tab-bar-tab");
    tabs[1]?.click();

    expect(view.execute).toHaveBeenCalledWith(ACTION_IDS.tab_activate, "b");

    view.cleanup();
  });

  it("shows scroll buttons when tabs overflow", () => {
    const view = render_tab_bar({
      tabs: [make_note_tab("a"), make_note_tab("b")],
    });

    expect(get_by_testid("tab-bar-scroll-right")).toBeNull();

    const container = document.body.querySelector(".TabBar__tabs");
    expect(container).not.toBeNull();
    Object.defineProperty(container, "scrollWidth", {
      value: 600,
      configurable: true,
    });
    Object.defineProperty(container, "clientWidth", {
      value: 200,
      configurable: true,
    });
    container?.dispatchEvent(new Event("scroll"));
    flushSync();

    expect(get_by_testid("tab-bar-scroll-right")).not.toBeNull();

    view.cleanup();
  });

  it("dispatches ui_toggle_context_rail from the actions area", () => {
    const view = render_tab_bar({ tabs: [make_note_tab("a")] });

    get_by_testid("tab-bar-context-rail-toggle")?.click();

    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.ui_toggle_context_rail,
    );

    view.cleanup();
  });
});
