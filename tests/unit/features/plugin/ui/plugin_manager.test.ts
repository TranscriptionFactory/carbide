/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";

vi.mock(
  "$lib/components/ui/dialog/index.js",
  async () => import("../../../helpers/ui_stubs/dialog"),
);
vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);
vi.mock(
  "$lib/components/ui/select/index.js",
  async () => import("../../../helpers/ui_stubs/select"),
);
vi.mock(
  "$lib/components/ui/switch/index.js",
  async () => import("../../../helpers/ui_stubs/switch"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import type {
  PluginInfo,
  PluginManifest,
  PluginSettingSchema,
} from "$lib/features/plugin/ports";
import PluginManager from "$lib/features/plugin/ui/plugin_manager.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";

function make_manifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    id: "plugin-a",
    name: "Plugin A",
    version: "1.0.0",
    author: "Test",
    description: "Test plugin",
    api_version: "1",
    permissions: [],
    ...overrides,
  };
}

function make_plugin(overrides?: Partial<PluginInfo>): PluginInfo {
  return {
    manifest: make_manifest(),
    path: "/vault/.carbide/plugins/plugin-a",
    enabled: true,
    status: "active",
    ...overrides,
  };
}

function create_context(options?: {
  openable_plugin_ids?: string[];
  settings_schema_by_plugin_id?: Record<string, PluginSettingSchema[]>;
}) {
  const stores = create_app_stores();
  const openable = new Set(options?.openable_plugin_ids ?? []);
  const settings_schema_by_plugin_id =
    options?.settings_schema_by_plugin_id ?? {};

  const plugin = {
    discover: vi.fn().mockResolvedValue([]),
    can_open_settings: vi.fn((plugin_id: string) => openable.has(plugin_id)),
    ensure_settings_ready: vi.fn().mockResolvedValue(undefined),
    get_effective_settings_schema: vi.fn(
      (plugin_id: string) => settings_schema_by_plugin_id[plugin_id] ?? [],
    ),
    reload_plugin: vi.fn().mockResolvedValue(undefined),
    unload_then_idle: vi.fn().mockResolvedValue(undefined),
    load_and_activate: vi.fn().mockResolvedValue(undefined),
    disable_plugin: vi.fn().mockResolvedValue(undefined),
    enable_plugin: vi.fn().mockResolvedValue(undefined),
  };

  const plugin_settings = {
    approve_permission: vi.fn().mockResolvedValue(undefined),
    deny_permission: vi.fn().mockResolvedValue(undefined),
  };

  const app_context = {
    stores,
    services: {
      plugin,
      plugin_settings,
    },
  } as unknown as Partial<AppContext>;

  return {
    app_context,
    stores,
    plugin,
  };
}

function query_button(selector: string): HTMLButtonElement | null {
  const element = document.body.querySelector(selector);
  return element instanceof HTMLButtonElement ? element : null;
}

function required_button(selector: string): HTMLButtonElement {
  const button = query_button(selector);
  if (!button) {
    throw new Error(`Expected button matching ${selector}`);
  }
  return button;
}

async function click(button: HTMLButtonElement) {
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve();
  flushSync();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("plugin_manager.svelte", () => {
  it("opens the settings dialog for plugins with settings", async () => {
    const schema: PluginSettingSchema[] = [
      {
        key: "api_key",
        type: "string",
        label: "API Key",
        default: "",
      },
    ];

    const { app_context, stores, plugin } = create_context({
      openable_plugin_ids: ["settings-plugin"],
      settings_schema_by_plugin_id: {
        "settings-plugin": schema,
      },
    });

    stores.plugin.plugins.set(
      "settings-plugin",
      make_plugin({
        manifest: make_manifest({
          id: "settings-plugin",
          name: "Settings Plugin",
          contributes: { settings: schema },
        }),
        path: "/vault/.carbide/plugins/settings-plugin",
      }),
    );

    const view = render_with_app_context(PluginManager, {
      app_context,
    });

    const button = required_button(
      'button[aria-label="Open plugin settings for Settings Plugin"]',
    );
    await click(button);

    expect(plugin.ensure_settings_ready).toHaveBeenCalledWith(
      "settings-plugin",
    );
    expect(document.body.textContent).toContain("Plugin Settings");
    expect(document.body.textContent).toContain("Settings Plugin");
    expect(document.body.textContent).toContain("API Key");

    view.cleanup();
  });

  it("hides the settings gear for plugins without settings", () => {
    const { app_context, stores } = create_context();

    stores.plugin.plugins.set(
      "plain-plugin",
      make_plugin({
        manifest: make_manifest({
          id: "plain-plugin",
          name: "Plain Plugin",
        }),
        path: "/vault/.carbide/plugins/plain-plugin",
      }),
    );

    const view = render_with_app_context(PluginManager, {
      app_context,
    });

    expect(
      query_button(
        'button[aria-label="Open plugin settings for Plain Plugin"]',
      ),
    ).toBeNull();

    view.cleanup();
  });
});
