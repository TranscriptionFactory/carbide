import { describe, expect, it } from "vitest";
import {
  SIDEBAR_VIEW_REGISTRY,
  default_sidebar_views_config,
  resolve_sidebar_views_config,
} from "$lib/app/sidebar_views";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";

const REGISTRY_IDS = SIDEBAR_VIEW_REGISTRY.map((view) => view.id);

describe("default_sidebar_views_config", () => {
  it("defaults dashboard to hidden and everything else visible", () => {
    const config = default_sidebar_views_config();
    const dashboard = config.find((entry) => entry.id === "dashboard");
    expect(dashboard?.visible).toBe(false);
    for (const entry of config) {
      if (entry.id === "dashboard") continue;
      expect(entry.visible).toBe(true);
    }
  });

  it("matches the inlined DEFAULT_EDITOR_SETTINGS literal", () => {
    expect(DEFAULT_EDITOR_SETTINGS.sidebar_views_config).toEqual(
      default_sidebar_views_config(),
    );
  });
});

describe("resolve_sidebar_views_config", () => {
  it("returns the canonical default for empty/undefined input", () => {
    expect(resolve_sidebar_views_config([])).toEqual(
      default_sidebar_views_config(),
    );
    expect(resolve_sidebar_views_config(undefined)).toEqual(
      default_sidebar_views_config(),
    );
    expect(resolve_sidebar_views_config(null)).toEqual(
      default_sidebar_views_config(),
    );
  });

  it("drops stored entries whose id is no longer in the registry", () => {
    const resolved = resolve_sidebar_views_config([
      { id: "explorer", visible: true },
      { id: "ghost_view", visible: true },
    ]);
    expect(resolved.some((entry) => entry.id === "ghost_view")).toBe(false);
    expect(resolved.map((entry) => entry.id).sort()).toEqual(
      [...REGISTRY_IDS].sort(),
    );
  });

  it("appends a newly shipped view at its canonical position", () => {
    // Stored config predates the "graph" view being registered.
    const stored = SIDEBAR_VIEW_REGISTRY.filter(
      (view) => view.id !== "graph",
    ).map((view) => ({ id: view.id, visible: true }));

    const resolved = resolve_sidebar_views_config(stored);
    const ids = resolved.map((entry) => entry.id);

    expect(ids).toContain("graph");
    // Canonical order places graph between tags and source_control.
    expect(ids.indexOf("graph")).toBe(ids.indexOf("tags") + 1);
    expect(ids.indexOf("graph")).toBeLessThan(ids.indexOf("source_control"));
    // Newly appended views adopt their default visibility.
    expect(resolved.find((entry) => entry.id === "graph")?.visible).toBe(true);
  });

  it("preserves user order and visibility for known entries", () => {
    const resolved = resolve_sidebar_views_config([
      { id: "tags", visible: false },
      { id: "explorer", visible: true },
    ]);

    const tags_index = resolved.findIndex((entry) => entry.id === "tags");
    const explorer_index = resolved.findIndex(
      (entry) => entry.id === "explorer",
    );

    expect(tags_index).toBeLessThan(explorer_index);
    expect(resolved[tags_index]?.visible).toBe(false);
    expect(resolved[explorer_index]?.visible).toBe(true);

    // Every registry view is present exactly once.
    expect(resolved).toHaveLength(REGISTRY_IDS.length);
    expect(new Set(resolved.map((entry) => entry.id)).size).toBe(
      REGISTRY_IDS.length,
    );
  });
});
