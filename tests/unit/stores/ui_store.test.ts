import { describe, expect, it } from "vitest";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";

describe("UIStore", () => {
  it("zen_mode defaults to false", () => {
    const store = new UIStore();
    expect(store.zen_mode).toBe(false);
  });

  it("toggle_zen_mode toggles zen_mode", () => {
    const store = new UIStore();
    store.toggle_zen_mode();
    expect(store.zen_mode).toBe(true);
    store.toggle_zen_mode();
    expect(store.zen_mode).toBe(false);
  });

  it("set_zen_mode sets zen_mode to given value", () => {
    const store = new UIStore();
    store.set_zen_mode(true);
    expect(store.zen_mode).toBe(true);
    store.set_zen_mode(false);
    expect(store.zen_mode).toBe(false);
  });

  it("reset_for_new_vault resets zen_mode to false", () => {
    const store = new UIStore();
    store.toggle_zen_mode();
    expect(store.zen_mode).toBe(true);
    store.reset_for_new_vault();
    expect(store.zen_mode).toBe(false);
  });

  it("set_editor_settings does not overwrite an open settings draft", () => {
    const store = new UIStore();
    store.settings_dialog = {
      ...store.settings_dialog,
      open: true,
      current_settings: {
        ...DEFAULT_EDITOR_SETTINGS,
        autosave_delay_ms: 3500,
      },
    };

    store.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      autosave_delay_ms: 500,
    });

    expect(store.editor_settings.autosave_delay_ms).toBe(500);
    expect(store.settings_dialog.current_settings.autosave_delay_ms).toBe(3500);
  });
});
