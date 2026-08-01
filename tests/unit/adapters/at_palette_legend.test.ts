/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import {
  render_dropdown,
  at_palette_insert_text,
} from "$lib/features/editor/adapters/at_palette_plugin";
import type { AtPaletteItem } from "$lib/features/editor/adapters/at_palette_types";

function render(items: AtPaletteItem[], active_prefix: "all" | "headings") {
  const dropdown = document.createElement("div");
  render_dropdown(dropdown, items, 0, active_prefix, vi.fn());
  return dropdown;
}

describe("at palette dropdown", () => {
  it("renders the legend when a prefix query matched nothing", () => {
    const dropdown = render([], "headings");

    expect(dropdown.querySelector(".AtPalette__legend")).not.toBeNull();
    expect(dropdown.querySelectorAll(".AtPalette__item")).toHaveLength(0);
  });

  it("marks the active prefix chip", () => {
    const dropdown = render([], "headings");
    const active = dropdown.querySelector(
      ".AtPalette__legend-chip--active .AtPalette__legend-key",
    );

    expect(active?.textContent).toBe("#");
  });

  it("still renders items alongside the legend", () => {
    const dropdown = render(
      [{ category: "tags", tag: "project", count: 3 }],
      "all",
    );

    expect(dropdown.querySelectorAll(".AtPalette__item")).toHaveLength(1);
    expect(dropdown.querySelector(".AtPalette__legend")).not.toBeNull();
  });
});

describe("at_palette_insert_text", () => {
  it("inserts a heading link without a visible .md extension", () => {
    expect(
      at_palette_insert_text({
        category: "headings",
        text: "Heading",
        note_path: "folder/note.md",
        level: 2,
      }),
    ).toBe("[[folder/note#Heading]]");
  });

  it("inserts a note link without a visible .md extension", () => {
    expect(
      at_palette_insert_text({
        category: "notes",
        title: "Note",
        path: "folder/note.md",
        kind: "existing",
      }),
    ).toBe("[[folder/note]]");
  });

  it("returns null for commands so the trigger is only deleted", () => {
    expect(
      at_palette_insert_text({
        category: "commands",
        id: "note.save",
        label: "Save",
        description: "Save the note",
        icon: "save",
      }),
    ).toBeNull();
  });
});
