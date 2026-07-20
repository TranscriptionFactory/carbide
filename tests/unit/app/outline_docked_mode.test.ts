import { describe, expect, it } from "vitest";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";

describe("outline docked mode", () => {
  it("defaults to open with docked mode", () => {
    const ui = new UIStore();
    expect(ui.outline_docked_open).toBe(true);
    expect(ui.editor_settings.outline_mode).toBe("docked");
  });

  it("reopens the docked pane when switching into docked mode", () => {
    const ui = new UIStore();
    ui.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      outline_mode: "rail",
    });
    ui.outline_docked_open = false;
    ui.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      outline_mode: "docked",
    });
    expect(ui.outline_docked_open).toBe(true);
  });

  it("keeps pane visibility when already in docked mode", () => {
    const ui = new UIStore();
    ui.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      outline_mode: "docked",
    });
    ui.outline_docked_open = false;
    ui.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      outline_mode: "docked",
      autosave_enabled: false,
    });
    expect(ui.outline_docked_open).toBe(false);
  });

  it("does not touch pane visibility for non-docked modes", () => {
    const ui = new UIStore();
    ui.outline_docked_open = false;
    ui.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      outline_mode: "rail",
    });
    expect(ui.outline_docked_open).toBe(false);
  });
});
