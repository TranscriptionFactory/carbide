/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Files, Search } from "@lucide/svelte";
import { flushSync, mount, unmount } from "../../helpers/svelte_client_runtime";

import ActivityBar from "$lib/app/bootstrap/ui/activity_bar.svelte";
import type { SidebarViewMeta } from "$lib/app";

function make_view(id: string, label: string, icon = Files): SidebarViewMeta {
  return {
    id,
    label,
    icon,
    command_icon: "file",
    keywords: [],
    vault_only: false,
    default_visible: true,
  };
}

function render_activity_bar(overrides?: {
  sidebar_open?: boolean;
  active_view?: string;
  configured_views?: SidebarViewMeta[];
  on_open_view?: (id: string) => void;
  on_open_help?: () => void;
  on_open_settings?: () => void;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(ActivityBar, {
    target,
    props: {
      sidebar_open: overrides?.sidebar_open ?? true,
      active_view: overrides?.active_view ?? "explorer",
      configured_views: overrides?.configured_views ?? [
        make_view("explorer", "Explorer", Files),
        make_view("search", "Search", Search),
      ],
      on_open_view: overrides?.on_open_view ?? vi.fn(),
      on_open_help: overrides?.on_open_help ?? vi.fn(),
      on_open_settings: overrides?.on_open_settings ?? vi.fn(),
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

function get_view_buttons(): HTMLButtonElement[] {
  return Array.from(
    document.body.querySelectorAll('[data-testid="activity-bar-button"]'),
  ).filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);
}

function get_by_testid(testid: string): HTMLElement | null {
  const element = document.body.querySelector(`[data-testid="${testid}"]`);
  return element instanceof HTMLElement ? element : null;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("activity_bar.svelte", () => {
  it("renders one button per configured view with view ids", () => {
    const view = render_activity_bar();

    const buttons = get_view_buttons();
    expect(buttons).toHaveLength(2);
    expect(buttons.map((b) => b.getAttribute("data-view-id"))).toEqual([
      "explorer",
      "search",
    ]);

    view.cleanup();
  });

  it("presses the active view button only while the sidebar is open", () => {
    const open_view = render_activity_bar({
      sidebar_open: true,
      active_view: "search",
    });
    let buttons = get_view_buttons();
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
    open_view.cleanup();

    const closed_view = render_activity_bar({
      sidebar_open: false,
      active_view: "search",
    });
    buttons = get_view_buttons();
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");
    closed_view.cleanup();
  });

  it("fires on_open_view with the clicked view id", () => {
    const on_open_view = vi.fn();
    const view = render_activity_bar({ on_open_view });

    get_view_buttons()[1]?.click();

    expect(on_open_view).toHaveBeenCalledWith("search");

    view.cleanup();
  });

  it("fires help and settings callbacks", () => {
    const on_open_help = vi.fn();
    const on_open_settings = vi.fn();
    const view = render_activity_bar({ on_open_help, on_open_settings });

    get_by_testid("activity-bar-help")?.click();
    get_by_testid("activity-bar-settings")?.click();

    expect(on_open_help).toHaveBeenCalledTimes(1);
    expect(on_open_settings).toHaveBeenCalledTimes(1);

    view.cleanup();
  });
});
