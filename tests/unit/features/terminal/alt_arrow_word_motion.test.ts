import { describe, it, expect } from "vitest";
import { alt_arrow_word_motion } from "$lib/features/terminal/domain/alt_arrow_word_motion";

function key(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    type: "keydown",
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    key: "ArrowLeft",
    ...overrides,
  } as KeyboardEvent;
}

describe("alt_arrow_word_motion", () => {
  it("maps Option+ArrowLeft to meta-b (back one word)", () => {
    expect(alt_arrow_word_motion(key({ key: "ArrowLeft" }))).toBe("\x1bb");
  });

  it("maps Option+ArrowRight to meta-f (forward one word)", () => {
    expect(alt_arrow_word_motion(key({ key: "ArrowRight" }))).toBe("\x1bf");
  });

  it("ignores when ctrl is held", () => {
    expect(alt_arrow_word_motion(key({ ctrlKey: true }))).toBeNull();
  });

  it("ignores when meta is held", () => {
    expect(alt_arrow_word_motion(key({ metaKey: true }))).toBeNull();
  });

  it("ignores when shift is held", () => {
    expect(alt_arrow_word_motion(key({ shiftKey: true }))).toBeNull();
  });

  it("ignores non-arrow keys", () => {
    expect(alt_arrow_word_motion(key({ key: "b" }))).toBeNull();
  });

  it("ignores keyup events", () => {
    expect(alt_arrow_word_motion(key({ type: "keyup" }))).toBeNull();
  });

  it("ignores when alt is not held", () => {
    expect(alt_arrow_word_motion(key({ altKey: false }))).toBeNull();
  });
});
