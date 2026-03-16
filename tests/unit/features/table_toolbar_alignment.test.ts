/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { ColumnAlignment } from "$lib/features/editor/adapters/table_toolbar_plugin";

describe("ColumnAlignment type", () => {
  it("accepts valid alignment values", () => {
    const left: ColumnAlignment = "left";
    const center: ColumnAlignment = "center";
    const right: ColumnAlignment = "right";
    expect(left).toBe("left");
    expect(center).toBe("center");
    expect(right).toBe("right");
  });
});

describe("alignment button active state logic", () => {
  let buttons: Map<ColumnAlignment, HTMLButtonElement>;

  function update_alignment_buttons(
    align_btns: Map<ColumnAlignment, HTMLButtonElement>,
    current: ColumnAlignment,
  ) {
    for (const [value, btn] of align_btns) {
      if (value === current) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    }
  }

  beforeEach(() => {
    buttons = new Map();
    for (const v of ["left", "center", "right"] as ColumnAlignment[]) {
      const btn = document.createElement("button");
      buttons.set(v, btn);
    }
  });

  it("marks only the active alignment button", () => {
    update_alignment_buttons(buttons, "center");
    expect(buttons.get("left")!.classList.contains("active")).toBe(false);
    expect(buttons.get("center")!.classList.contains("active")).toBe(true);
    expect(buttons.get("right")!.classList.contains("active")).toBe(false);
  });

  it("switches active state when alignment changes", () => {
    update_alignment_buttons(buttons, "left");
    expect(buttons.get("left")!.classList.contains("active")).toBe(true);

    update_alignment_buttons(buttons, "right");
    expect(buttons.get("left")!.classList.contains("active")).toBe(false);
    expect(buttons.get("right")!.classList.contains("active")).toBe(true);
  });

  it("marks left by default", () => {
    update_alignment_buttons(buttons, "left");
    expect(buttons.get("left")!.classList.contains("active")).toBe(true);
    expect(buttons.get("center")!.classList.contains("active")).toBe(false);
    expect(buttons.get("right")!.classList.contains("active")).toBe(false);
  });
});
