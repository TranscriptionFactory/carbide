// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { find_scroll_container } from "$lib/features/editor/domain/scroll_container";

function el(overflow_y?: string): HTMLElement {
  const node = document.createElement("div");
  if (overflow_y) node.style.overflowY = overflow_y;
  return node;
}

describe("find_scroll_container", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null when no start element is given", () => {
    expect(find_scroll_container(null)).toBe(null);
  });

  it("returns the start element when it scrolls", () => {
    const scroller = el("auto");
    document.body.appendChild(scroller);
    expect(find_scroll_container(scroller)).toBe(scroller);
  });

  it("walks up to the first scrollable ancestor", () => {
    const scroller = el("scroll");
    const middle = el("visible");
    const start = el();
    middle.appendChild(start);
    scroller.appendChild(middle);
    document.body.appendChild(scroller);
    expect(find_scroll_container(start)).toBe(scroller);
  });

  it("returns null when no ancestor scrolls", () => {
    const parent = el();
    const start = el();
    parent.appendChild(start);
    document.body.appendChild(parent);
    expect(find_scroll_container(start)).toBe(null);
  });
});
