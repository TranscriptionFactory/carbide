/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Files } from "@lucide/svelte";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../helpers/mock_app_context"),
);
vi.mock(
  "$lib/components/ui/tooltip/index.js",
  async () => import("../../helpers/ui_stubs/tooltip"),
);
vi.mock(
  "$lib/components/ui/sidebar/index.js",
  async () => import("../../helpers/ui_stubs/sidebar"),
);
vi.mock(
  "$lib/app/bootstrap/ui/sidebar_explorer_view.svelte",
  async () => import("../../helpers/ui_stubs/dialog_fragment.svelte"),
);
/* Stubbed so the built-in panel barrels stay unloaded and the header
   resolves a title for every view (no VaultSwitcherDropdown render). */
vi.mock("$lib/app/bootstrap/ui/workspace_sidebar_views", () => ({
  SIDEBAR_PANEL_COMPONENTS: {},
  TITLED_VIEWS: new Set(["explorer"]),
}));

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import type { SidebarView } from "$lib/features/plugin";
import WorkspaceSidebar from "$lib/app/bootstrap/ui/workspace_sidebar.svelte";
import PluginPanel from "../../helpers/ui_stubs/plugin_panel.svelte";
import { create_test_vault } from "../../helpers/test_fixtures";
import { render_with_app_context } from "../../helpers/render_with_app_context";
import { flushSync } from "../../helpers/svelte_client_runtime";

const PLUGIN_VIEW_ID = "plugin:test-panel";

function render_sidebar() {
  const stores = create_app_stores();
  stores.vault.set_vault(create_test_vault());
  stores.plugin.register_sidebar_view({
    id: PLUGIN_VIEW_ID,
    label: "Test Panel",
    icon: Files,
    panel: PluginPanel,
  } as SidebarView);
  const rendered = render_with_app_context(WorkspaceSidebar, {
    app_context: {
      stores,
      action_registry: { execute: vi.fn() },
    } as unknown as Partial<AppContext>,
  });
  return { stores, ...rendered };
}

function panel_el(target: Element) {
  return target.querySelector('[data-testid="plugin-panel"]');
}

function panel_group(target: Element): HTMLElement {
  const group = panel_el(target)?.closest<HTMLElement>(
    '[data-testid="sidebar-group"]',
  );
  if (!group) throw new Error("Plugin panel group not found");
  return group;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("workspace_sidebar plugin panel keep-alive", () => {
  it("does not mount a plugin panel before its view is first opened", () => {
    const { target, cleanup } = render_sidebar();
    expect(panel_el(target)).toBeNull();
    cleanup();
  });

  it("keeps the panel DOM alive and hidden across view switches", () => {
    const { stores, target, cleanup } = render_sidebar();

    stores.ui.sidebar_view = PLUGIN_VIEW_ID;
    flushSync();
    const panel = panel_el(target);
    expect(panel).not.toBeNull();
    expect(panel_group(target).hidden).toBe(false);

    stores.ui.sidebar_view = "explorer";
    flushSync();
    expect(panel?.isConnected).toBe(true);
    expect(panel_group(target).hidden).toBe(true);

    stores.ui.sidebar_view = PLUGIN_VIEW_ID;
    flushSync();
    expect(panel_el(target)).toBe(panel);
    expect(panel_group(target).hidden).toBe(false);

    cleanup();
  });
});
