import { describe, it, expect } from "vitest";
import { should_show_macos_drag_strip } from "$lib/features/window";

describe("should_show_macos_drag_strip", () => {
  it("shows the strip on macOS when the lattice title bar is absent", () => {
    expect(should_show_macos_drag_strip(true, false)).toBe(true);
  });

  it("hides the strip on macOS when the lattice title bar provides drag chrome", () => {
    expect(should_show_macos_drag_strip(true, true)).toBe(false);
  });

  it("never shows the strip off macOS", () => {
    expect(should_show_macos_drag_strip(false, false)).toBe(false);
    expect(should_show_macos_drag_strip(false, true)).toBe(false);
  });
});
