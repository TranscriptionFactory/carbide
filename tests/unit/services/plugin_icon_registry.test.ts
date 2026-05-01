import { describe, expect, it } from "vitest";
import { resolve_plugin_icon } from "$lib/features/plugin/application/plugin_icon_registry";
import Blocks from "@lucide/svelte/icons/blocks";
import Calendar from "@lucide/svelte/icons/calendar";
import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";

describe("resolve_plugin_icon", () => {
  it("returns the matching component for a known icon name", () => {
    expect(resolve_plugin_icon("calendar")).toBe(Calendar);
    expect(resolve_plugin_icon("layout-dashboard")).toBe(LayoutDashboard);
    expect(resolve_plugin_icon("blocks")).toBe(Blocks);
  });

  it("falls back to Blocks for unknown icon names", () => {
    expect(resolve_plugin_icon("nonexistent-icon")).toBe(Blocks);
  });

  it("falls back to Blocks when name is undefined", () => {
    expect(resolve_plugin_icon(undefined)).toBe(Blocks);
  });

  it("falls back to Blocks for empty string", () => {
    expect(resolve_plugin_icon("")).toBe(Blocks);
  });
});
