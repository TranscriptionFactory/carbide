import { describe, expect, it } from "vitest";
import { px_to_min_size } from "$lib/app/bootstrap/pane_min_size";

describe("px_to_min_size", () => {
  it("converts a px floor into a percentage of the group width", () => {
    expect(px_to_min_size(220, 1100, 12, 30)).toBe(20);
    expect(px_to_min_size(200, 1000, 10, 25)).toBe(20);
  });

  it("returns the fallback before the group has been measured", () => {
    expect(px_to_min_size(220, 0, 12, 30)).toBe(12);
    expect(px_to_min_size(220, -5, 12, 30)).toBe(12);
  });

  it("caps the percentage so it stays within the pane's maxSize", () => {
    expect(px_to_min_size(220, 400, 12, 30)).toBe(30);
  });

  it("caps the context rail at 45% once its 220px floor would exceed that", () => {
    expect(px_to_min_size(220, 489, 12, 45)).toBe(45);
    expect(px_to_min_size(220, 400, 12, 45)).toBe(45);
    expect(px_to_min_size(220, 733, 12, 45)).toBe(30.1);
  });

  it("drops below the fallback on wide groups to honor the px floor exactly", () => {
    expect(px_to_min_size(220, 2200, 12, 30)).toBe(10);
  });

  it("quantizes to 0.1% steps, rounding up so the px floor is never undercut", () => {
    expect(px_to_min_size(220, 1440, 12, 30)).toBe(15.3);
    expect(px_to_min_size(220, 1441, 12, 30)).toBe(15.3);
  });
});
