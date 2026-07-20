import { describe, expect, it } from "vitest";
import {
  SIDEBAR_PANEL_COMPONENTS,
  TITLED_VIEWS,
} from "$lib/app/bootstrap/ui/workspace_sidebar_views";
import { SIDEBAR_VIEW_REGISTRY, SIDEBAR_VIEWS } from "$lib/app";

const registry_ids = SIDEBAR_VIEW_REGISTRY.map((view) => view.id);

describe("sidebar panel map", () => {
  it("maps only registry ids", () => {
    for (const key of Object.keys(SIDEBAR_PANEL_COMPONENTS)) {
      expect(registry_ids).toContain(key);
    }
  });

  it("covers every registry id except explorer", () => {
    for (const id of registry_ids) {
      if (id === SIDEBAR_VIEWS.explorer) continue;
      expect(SIDEBAR_PANEL_COMPONENTS[id]).toBeDefined();
    }
    expect(SIDEBAR_PANEL_COMPONENTS[SIDEBAR_VIEWS.explorer]).toBeUndefined();
  });

  it("titled views are registry ids", () => {
    for (const id of TITLED_VIEWS) {
      expect(registry_ids).toContain(id);
    }
  });
});
