import { describe, expect, it } from "vitest";
import {
  build_source_editor_background_theme_spec,
  build_source_editor_base_theme_spec,
  build_source_editor_hide_line_numbers_theme_spec,
} from "$lib/features/editor/ui/source_editor_theme";

describe("source_editor_theme", () => {
  it("uses a dedicated source editor background token", () => {
    expect(build_source_editor_background_theme_spec()).toEqual({
      "&": {
        backgroundColor: "var(--editor-source-bg, var(--editor-background))",
      },
    });
  });

  it("keeps gutter styling transparent so the source background shows through", () => {
    const spec = build_source_editor_base_theme_spec();

    expect(spec[".cm-gutters"]).toEqual({
      backgroundColor: "transparent",
      borderRight: "1px solid var(--border)",
      color: "var(--editor-gutter)",
      opacity: "0.5",
    });
  });

  it("hides only line numbers, not fold gutters, when line numbers are disabled", () => {
    const spec = build_source_editor_hide_line_numbers_theme_spec();

    expect(spec).toEqual({
      ".cm-lineNumbers": {
        display: "none",
      },
    });
    expect(spec).not.toHaveProperty(".cm-gutters");
  });
});
