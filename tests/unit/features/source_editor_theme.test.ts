import { describe, expect, it } from "vitest";
import {
  build_source_editor_background_theme_spec,
  build_source_editor_base_theme_spec,
  build_source_editor_hide_gutters_theme_spec,
} from "$lib/features/editor/ui/source_editor_theme";

describe("source_editor_theme", () => {
  it("uses a dedicated source editor background token", () => {
    expect(build_source_editor_background_theme_spec()).toEqual({
      "&": {
        backgroundColor: "var(--editor-source-bg, var(--background))",
      },
    });
  });

  it("keeps gutter styling transparent so the source background shows through", () => {
    const spec = build_source_editor_base_theme_spec();

    expect(spec[".cm-gutters"]).toEqual({
      backgroundColor: "transparent",
      borderRight: "1px solid var(--border)",
      color: "var(--muted-foreground)",
      opacity: "0.5",
    });
  });

  it("can hide gutters when line numbers are disabled", () => {
    expect(build_source_editor_hide_gutters_theme_spec()).toEqual({
      ".cm-gutters": {
        display: "none",
      },
    });
  });
});
