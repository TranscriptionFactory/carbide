/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Files } from "@lucide/svelte";
import { flushSync, mount, unmount } from "../../helpers/svelte_client_runtime";

import ActivityBar from "$lib/app/bootstrap/ui/activity_bar.svelte";
import type { SidebarViewMeta } from "$lib/app";

function make_view(id: string, label: string): SidebarViewMeta {
  return {
    id,
    label,
    icon: Files,
    command_icon: "file",
    keywords: [],
    vault_only: false,
    default_visible: true,
  };
}

function render_activity_bar(on_open_view: (id: string) => void) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(ActivityBar, {
    target,
    props: {
      sidebar_open: true,
      active_view: "explorer",
      configured_views: [
        make_view("explorer", "Explorer"),
        make_view("search", "Search"),
      ],
      on_open_view,
      on_open_help: vi.fn(),
      on_open_settings: vi.fn(),
    },
  });

  flushSync();

  return {
    cleanup() {
      unmount(app);
      target.remove();
      flushSync();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("activity_bar.svelte keyboard", () => {
  it("exposes all controls as focusable buttons in DOM order", () => {
    const view = render_activity_bar(vi.fn());

    const buttons = Array.from(
      document.body.querySelectorAll(".ActivityBar button"),
    ).filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);

    expect(buttons).toHaveLength(4);
    expect(buttons.map((b) => b.getAttribute("data-testid") ?? "view")).toEqual(
      [
        "activity-bar-button",
        "activity-bar-button",
        "activity-bar-help",
        "activity-bar-settings",
      ],
    );
    for (const button of buttons) {
      expect(button.tabIndex).toBe(0);
    }

    view.cleanup();
  });

  it("activates a view via keyboard activation semantics", () => {
    const on_open_view = vi.fn();
    const view = render_activity_bar(on_open_view);

    const search_button = document.body.querySelector(
      '[data-view-id="search"]',
    );
    if (!(search_button instanceof HTMLButtonElement)) {
      throw new Error("expected search view button");
    }

    search_button.focus();
    search_button.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    search_button.click();

    expect(on_open_view).toHaveBeenCalledWith("search");

    view.cleanup();
  });
});
