import { describe, expect, it } from "vitest";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";

describe("UIStore", () => {
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
