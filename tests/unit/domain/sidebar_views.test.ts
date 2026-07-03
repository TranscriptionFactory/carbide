import { describe, expect, it } from "vitest";
import {
  SIDEBAR_VIEW_REGISTRY,
  combined_sidebar_view_registry,
  default_sidebar_views_config,
  resolve_sidebar_views_config,
} from "$lib/app/sidebar_views";
import type { DynamicSidebarView } from "$lib/app/sidebar_views";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";

const REGISTRY_IDS = SIDEBAR_VIEW_REGISTRY.map((view) => view.id);

const ICON = {} as DynamicSidebarView["icon"];
const dyn = (id: string): DynamicSidebarView => ({ id, label: id, icon: ICON });
const DYNAMIC: DynamicSidebarView[] = [dyn("references"), dyn("bases")];

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

describe("combined_sidebar_view_registry", () => {
  it("appends dynamic views as vault-only and visible by default", () => {
    const combined = combined_sidebar_view_registry(DYNAMIC);
    const references = combined.find((v) => v.id === "references");

    expect(references).toBeDefined();
    expect(references?.vault_only).toBe(true);
    expect(references?.default_visible).toBe(true);
    // Static views keep their canonical order, dynamic views follow.
    expect(combined.map((v) => v.id).slice(0, REGISTRY_IDS.length)).toEqual(
      REGISTRY_IDS,
    );
    expect(combined.map((v) => v.id).slice(REGISTRY_IDS.length)).toEqual([
      "references",
      "bases",
    ]);
  });

  it("lets a static registry id win over a colliding dynamic id", () => {
    const combined = combined_sidebar_view_registry([dyn("explorer")]);
    const explorer = combined.filter((v) => v.id === "explorer");
    expect(explorer).toHaveLength(1);
    expect(explorer[0]?.vault_only).toBe(false);
  });
});

describe("resolve_sidebar_views_config with dynamic views", () => {
  it("includes registered dynamic views, defaulting them to visible", () => {
    const resolved = resolve_sidebar_views_config([], DYNAMIC);
    const references = resolved.find((entry) => entry.id === "references");
    expect(references?.visible).toBe(true);
    expect(resolved.map((entry) => entry.id)).toEqual([
      ...REGISTRY_IDS,
      "references",
      "bases",
    ]);
  });

  it("preserves user visibility/order for a dynamic view", () => {
    const resolved = resolve_sidebar_views_config(
      [{ id: "bases", visible: false }],
      DYNAMIC,
    );
    expect(resolved.find((entry) => entry.id === "bases")?.visible).toBe(false);
  });

  it("drops a stored dynamic id once its view is unregistered", () => {
    const resolved = resolve_sidebar_views_config(
      [{ id: "references", visible: true }],
      [],
    );
    expect(resolved.some((entry) => entry.id === "references")).toBe(false);
  });
});
