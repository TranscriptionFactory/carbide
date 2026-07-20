import { describe, expect, it } from "vitest";
import {
  is_within_formatting_toolbar_hover_bridge,
  type RectLike,
} from "$lib/features/editor/domain/formatting_toolbar_hover_bridge";

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): RectLike {
  return { left, top, right: left + width, bottom: top + height };
}

describe("is_within_formatting_toolbar_hover_bridge", () => {
  it("treats the gap between the selected anchor and toolbar as part of the hover bridge", () => {
    expect(
      is_within_formatting_toolbar_hover_bridge(
        { x: 368, y: 104 },
        rect(300, 130, 140, 90),
        rect(322, 78, 96, 24),
      ),
    ).toBe(true);
  });

  it("ignores invisible rectangles", () => {
    expect(
      is_within_formatting_toolbar_hover_bridge(
        { x: 10, y: 10 },
        rect(300, 130, 0, 90),
        rect(322, 78, 96, 24),
      ),
    ).toBe(false);
  });

  it("leaves unrelated pointer movement alone", () => {
    expect(
      is_within_formatting_toolbar_hover_bridge(
        { x: 520, y: 220 },
        rect(300, 130, 140, 90),
        rect(322, 78, 96, 24),
      ),
    ).toBe(false);
  });
});
