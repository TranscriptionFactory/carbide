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

vi.mock(
  "$lib/components/ui/textarea",
  async () => import("../../../helpers/ui_stubs/textarea"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import type {
  PluginSettingSchema,
  PluginSettingsEntry,
} from "$lib/features/plugin/ports";
import PluginSettingsDialog from "$lib/features/plugin/ui/plugin_settings_dialog.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";

function create_entry(
  settings: Record<string, unknown>,
  overrides?: Partial<PluginSettingsEntry>,
): PluginSettingsEntry {
  return {
    enabled: true,
    version: "1.0.0",
    source: "local",
    permissions_granted: [],
    permissions_pending: [],
    settings,
    content_hash: null,
    ...overrides,
  };
}

function create_context(settings: Record<string, unknown> = {}) {
  const stores = create_app_stores();
  stores.plugin_settings.set_entry("plugin-a", create_entry(settings));

  const plugin_settings = {
    set_setting: vi.fn((plugin_id: string, key: string, value: unknown) => {
      stores.plugin_settings.set_setting(plugin_id, key, value);
      return Promise.resolve();
    }),
  };

  const app_context = {
    stores,
    services: {
      plugin_settings,
    },
  } as unknown as Partial<AppContext>;

  return {
    app_context,
    plugin_settings,
  };
}

function required_input(selector: string): HTMLInputElement {
  const element = document.body.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Expected input matching ${selector}`);
  }
  return element;
}

function required_textarea(selector: string): HTMLTextAreaElement {
  const element = document.body.querySelector(selector);
  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error(`Expected textarea matching ${selector}`);
  }
  return element;
}

function required_element(selector: string): HTMLElement {
  const element = document.body.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element matching ${selector}`);
  }
  return element;
}

function required_button(selector: string): HTMLButtonElement {
  const element = document.body.querySelector(selector);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Expected button matching ${selector}`);
  }
  return element;
}

async function settle() {
  await Promise.resolve();
  flushSync();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("plugin_settings_dialog.svelte", () => {
  it("renders an empty state when no settings are registered", () => {
    const { app_context } = create_context();

    const view = render_with_app_context(PluginSettingsDialog, {
      app_context,
      props: {
        plugin_id: "plugin-a",
        plugin_name: "Plugin A",
        plugin_version: "1.0.0",
        settings_schema: [],
        on_close: vi.fn(),
      },
    });

    expect(document.body.textContent).toContain(
      "This plugin has not registered any settings yet.",
    );

    view.cleanup();
  });

  it("renders and saves string settings", async () => {
    const { app_context, plugin_settings } = create_context({
      api_key: "secret",
    });
    const schema: PluginSettingSchema[] = [
      {
        key: "api_key",
        type: "string",
        label: "API Key",
      },
    ];

    const view = render_with_app_context(PluginSettingsDialog, {
      app_context,
      props: {
        plugin_id: "plugin-a",
        plugin_name: "Plugin A",
        plugin_version: "1.0.0",
        settings_schema: schema,
        on_close: vi.fn(),
      },
    });

    const input = required_input("#plugin-a-api_key");
    expect(input.value).toBe("secret");

    input.value = "updated-secret";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();

    expect(plugin_settings.set_setting).toHaveBeenCalledWith(
      "plugin-a",
      "api_key",
      "updated-secret",
    );
    expect(input.value).toBe("updated-secret");

    view.cleanup();
  });

  it("renders and saves boolean settings", async () => {
    const { app_context, plugin_settings } = create_context({
      enabled_flag: true,
    });
    const schema: PluginSettingSchema[] = [
      {
        key: "enabled_flag",
        type: "boolean",
        label: "Enabled Flag",
      },
    ];

    const view = render_with_app_context(PluginSettingsDialog, {
      app_context,
      props: {
        plugin_id: "plugin-a",
        plugin_name: "Plugin A",
        plugin_version: "1.0.0",
        settings_schema: schema,
        on_close: vi.fn(),
      },
    });

    const checkbox = required_input(
      'input[type="checkbox"][aria-label="Enabled Flag"]',
    );
    expect(checkbox.checked).toBe(true);

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();

    expect(plugin_settings.set_setting).toHaveBeenCalledWith(
      "plugin-a",
      "enabled_flag",
      false,
    );
    expect(checkbox.checked).toBe(false);

    view.cleanup();
  });

  it("renders and saves number settings on blur", async () => {
    const { app_context, plugin_settings } = create_context({
      threshold: 3,
    });
    const schema: PluginSettingSchema[] = [
      {
        key: "threshold",
        type: "number",
        label: "Threshold",
      },
    ];

    const view = render_with_app_context(PluginSettingsDialog, {
      app_context,
      props: {
        plugin_id: "plugin-a",
        plugin_name: "Plugin A",
        plugin_version: "1.0.0",
        settings_schema: schema,
        on_close: vi.fn(),
      },
    });

    const input = required_input("#plugin-a-threshold");
    expect(input.value).toBe("3");

    input.value = "7";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(plugin_settings.set_setting).not.toHaveBeenCalled();

    input.dispatchEvent(new Event("blur", { bubbles: true }));
    await settle();

    expect(plugin_settings.set_setting).toHaveBeenCalledWith(
      "plugin-a",
      "threshold",
      7,
    );
    expect(input.value).toBe("7");

    view.cleanup();
  });

  it("renders and saves select settings", async () => {
    const { app_context, plugin_settings } = create_context({
      mode: "balanced",
    });
    const schema: PluginSettingSchema[] = [
      {
        key: "mode",
        type: "select",
        label: "Mode",
        options: [
          { label: "Balanced", value: "balanced" },
          { label: "Aggressive", value: "aggressive" },
        ],
      },
    ];

    const view = render_with_app_context(PluginSettingsDialog, {
      app_context,
      props: {
        plugin_id: "plugin-a",
        plugin_name: "Plugin A",
        plugin_version: "1.0.0",
        settings_schema: schema,
        on_close: vi.fn(),
      },
    });

    const trigger = required_element("#plugin-a-mode");
    expect(trigger.textContent).toContain("Balanced");

    const aggressive_option = required_button(
      'button[data-value="aggressive"]',
    );
    aggressive_option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();

    expect(plugin_settings.set_setting).toHaveBeenCalledWith(
      "plugin-a",
      "mode",
      "aggressive",
    );
    expect(trigger.textContent).toContain("Aggressive");

    view.cleanup();
  });

  it("renders and saves textarea settings", async () => {
    const { app_context, plugin_settings } = create_context({
      prompt_template: "Hello world",
    });
    const schema: PluginSettingSchema[] = [
      {
        key: "prompt_template",
        type: "textarea",
        label: "Prompt Template",
        placeholder: "Enter your prompt...",
      },
    ];

    const view = render_with_app_context(PluginSettingsDialog, {
      app_context,
      props: {
        plugin_id: "plugin-a",
        plugin_name: "Plugin A",
        plugin_version: "1.0.0",
        settings_schema: schema,
        on_close: vi.fn(),
      },
    });

    const textarea = required_textarea("#plugin-a-prompt_template");
    expect(textarea.value).toBe("Hello world");
    expect(textarea.placeholder).toBe("Enter your prompt...");

    textarea.value = "Updated prompt";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();

    expect(plugin_settings.set_setting).toHaveBeenCalledWith(
      "plugin-a",
      "prompt_template",
      "Updated prompt",
    );

    view.cleanup();
  });

  it("clamps number to min/max on blur", async () => {
    const { app_context, plugin_settings } = create_context({
      count: 5,
    });
    const schema: PluginSettingSchema[] = [
      {
        key: "count",
        type: "number",
        label: "Count",
        min: 1,
        max: 10,
      },
    ];

    const view = render_with_app_context(PluginSettingsDialog, {
      app_context,
      props: {
        plugin_id: "plugin-a",
        plugin_name: "Plugin A",
        plugin_version: "1.0.0",
        settings_schema: schema,
        on_close: vi.fn(),
      },
    });

    const input = required_input("#plugin-a-count");

    input.value = "99";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    await settle();

    expect(plugin_settings.set_setting).toHaveBeenCalledWith(
      "plugin-a",
      "count",
      10,
    );
    expect(input.value).toBe("10");

    plugin_settings.set_setting.mockClear();

    input.value = "-5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    await settle();

    expect(plugin_settings.set_setting).toHaveBeenCalledWith(
      "plugin-a",
      "count",
      1,
    );
    expect(input.value).toBe("1");

    view.cleanup();
  });

  it("renders placeholder on string input", async () => {
    const { app_context } = create_context({});
    const schema: PluginSettingSchema[] = [
      {
        key: "api_key",
        type: "string",
        label: "API Key",
        placeholder: "sk-...",
      },
    ];

    const view = render_with_app_context(PluginSettingsDialog, {
      app_context,
      props: {
        plugin_id: "plugin-a",
        plugin_name: "Plugin A",
        plugin_version: "1.0.0",
        settings_schema: schema,
        on_close: vi.fn(),
      },
    });

    const input = required_input("#plugin-a-api_key");
    expect(input.placeholder).toBe("sk-...");

    view.cleanup();
  });

  it("renders number input with min/max HTML attributes", () => {
    const { app_context } = create_context({ rate: 5 });
    const schema: PluginSettingSchema[] = [
      {
        key: "rate",
        type: "number",
        label: "Rate",
        min: 0,
        max: 100,
      },
    ];

    const view = render_with_app_context(PluginSettingsDialog, {
      app_context,
      props: {
        plugin_id: "plugin-a",
        plugin_name: "Plugin A",
        plugin_version: "1.0.0",
        settings_schema: schema,
        on_close: vi.fn(),
      },
    });

    const input = required_input("#plugin-a-rate");
    expect(input.min).toBe("0");
    expect(input.max).toBe("100");

    view.cleanup();
  });
});
