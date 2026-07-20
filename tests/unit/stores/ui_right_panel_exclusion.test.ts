import { describe, expect, it } from "vitest";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";

function open_panels(ui: UIStore) {
  return {
    outline: ui.outline_docked_open,
    rail: ui.context_rail_open,
  };
}

describe("right panel exclusion", () => {
  it("closes the docked outline when the context rail opens", () => {
    const ui = new UIStore();
    ui.outline_docked_open = true;

    ui.open_context_rail();

    expect(open_panels(ui)).toEqual({ outline: false, rail: true });
  });

  it("closes the context rail when the docked outline opens", () => {
    const ui = new UIStore();
    ui.outline_docked_open = false;
    ui.open_context_rail();

    ui.toggle_docked_outline();

    expect(open_panels(ui)).toEqual({ outline: true, rail: false });
  });

  it("closes the docked outline when any context rail tab is selected", () => {
    const ui = new UIStore();
    ui.outline_docked_open = true;

    ui.set_context_rail_tab("tasks");

    expect(ui.context_rail_tab).toBe("tasks");
    expect(open_panels(ui)).toEqual({ outline: false, rail: true });
  });

  it("leaves no right panel open when the context rail is toggled closed", () => {
    const ui = new UIStore();
    ui.open_context_rail();

    ui.toggle_context_rail();

    expect(open_panels(ui)).toEqual({ outline: false, rail: false });
  });

  it("leaves no right panel open when the docked outline is toggled closed", () => {
    const ui = new UIStore();
    ui.outline_docked_open = true;

    ui.toggle_docked_outline();

    expect(open_panels(ui)).toEqual({ outline: false, rail: false });
  });

  it("never leaves the docked outline and context rail open together", () => {
    const ui = new UIStore();

    ui.toggle_docked_outline();
    expect(ui.outline_docked_open && ui.context_rail_open).toBe(false);

    ui.toggle_context_rail();
    expect(ui.outline_docked_open && ui.context_rail_open).toBe(false);

    ui.toggle_docked_outline();
    expect(ui.outline_docked_open && ui.context_rail_open).toBe(false);
  });
});
