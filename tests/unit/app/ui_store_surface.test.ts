import { describe, expect, it } from "vitest";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { LITE_APP_SURFACE } from "$lib/app/orchestration/app_surface";

describe("UIStore app surfaces", () => {
  it("normalizes lite-only sidebar, context rail, and bottom panel state", () => {
    const store = new UIStore(LITE_APP_SURFACE);

    store.set_sidebar_view("dashboard");
    store.set_context_rail_tab("metadata");
    store.set_bottom_panel_tab("query");

    expect(store.sidebar_view).toBe("explorer");
    expect(store.context_rail_tab).toBe("links");
    expect(store.bottom_panel_tab).toBe("terminal");
  });

  it("resets lite surface state to lite defaults for new vaults", () => {
    const store = new UIStore(LITE_APP_SURFACE);

    store.set_sidebar_view("starred");
    store.set_context_rail_tab("outline");
    store.set_bottom_panel_tab("problems");
    store.reset_for_new_vault();

    expect(store.sidebar_view).toBe("explorer");
    expect(store.context_rail_tab).toBe("links");
    expect(store.bottom_panel_tab).toBe("terminal");
  });
});
