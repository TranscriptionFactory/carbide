/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../helpers/mock_app_context"),
);
vi.mock(
  "$lib/components/ui/tooltip/index.js",
  async () => import("../helpers/ui_stubs/tooltip"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import ContextRail from "$lib/features/links/ui/context_rail.svelte";
import { render_with_app_context } from "../helpers/render_with_app_context";
import { flushSync } from "../helpers/svelte_client_runtime";

function render_context_rail(stores = create_app_stores()) {
  const rendered = render_with_app_context(ContextRail, {
    app_context: { stores } as unknown as Partial<AppContext>,
  });
  return { stores, ...rendered };
}

function click(target: Element, testid: string) {
  const el = target.querySelector<HTMLButtonElement>(
    `[data-testid="${testid}"]`,
  );
  expect(el).not.toBeNull();
  el!.click();
  flushSync();
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("context_rail tab toggling", () => {
  it("activates an inactive tab via set_context_rail_tab", () => {
    const { stores, target, cleanup } = render_context_rail();
    const spy = vi.spyOn(stores.ui, "set_context_rail_tab");
    click(target, "context-rail-tab-links");
    expect(spy).toHaveBeenCalledWith("links");
    expect(stores.ui.context_rail_open).toBe(true);
    cleanup();
  });

  it("closes the rail when the active tab icon is clicked", () => {
    const stores = create_app_stores();
    stores.ui.context_rail_tab = "links";
    stores.ui.context_rail_open = true;
    const { target, cleanup } = render_context_rail(stores);
    click(target, "context-rail-tab-links");
    expect(stores.ui.context_rail_open).toBe(false);
    cleanup();
  });

  it("hides the outline icon when docked with no headings", () => {
    const stores = create_app_stores();
    stores.ui.editor_settings.outline_mode = "docked";
    const { target, cleanup } = render_context_rail(stores);
    expect(
      target.querySelector('[data-testid="context-rail-tab-outline"]'),
    ).toBeNull();
    cleanup();
  });

  it("toggles the docked outline pane from the outline icon", () => {
    const stores = create_app_stores();
    stores.ui.editor_settings.outline_mode = "docked";
    stores.outline.set_headings([{ id: "h1", level: 1, text: "H", pos: 0 }]);
    stores.ui.outline_docked_open = false;
    const { target, cleanup } = render_context_rail(stores);
    click(target, "context-rail-tab-outline");
    expect(stores.ui.outline_docked_open).toBe(true);
    expect(stores.ui.context_rail_open).toBe(false);
    cleanup();
  });
});
