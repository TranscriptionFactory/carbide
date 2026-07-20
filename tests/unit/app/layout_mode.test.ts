import { describe, expect, it } from "vitest";
import {
  panels_mode,
  resolve_layout_variant,
} from "$lib/app/bootstrap/layout_mode";
import type { Theme } from "$lib/shared/types/theme";

function theme_with_variant(layout_variant: Theme["layout_variant"]): Theme {
  return { layout_variant } as Theme;
}

describe("resolve_layout_variant", () => {
  it("follows the theme suggestion on auto", () => {
    expect(
      resolve_layout_variant(theme_with_variant("spotlight"), "auto"),
    ).toBe("spotlight");
    expect(resolve_layout_variant(theme_with_variant("default"), "auto")).toBe(
      "default",
    );
  });

  it("explicit preset overrides the theme", () => {
    expect(
      resolve_layout_variant(theme_with_variant("spotlight"), "default"),
    ).toBe("default");
    expect(
      resolve_layout_variant(theme_with_variant("default"), "theater"),
    ).toBe("theater");
  });
});

describe("panels_mode", () => {
  it("overlay for spotlight and theater, docked otherwise", () => {
    expect(panels_mode("spotlight")).toBe("overlay");
    expect(panels_mode("theater")).toBe("overlay");
    expect(panels_mode("default")).toBe("docked");
  });
});
