import { describe, expect, it } from "vitest";
import { is_plain_enter } from "$lib/shared/utils/keyboard";

function make_event(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: "Enter",
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("is_plain_enter", () => {
  it("accepts unmodified Enter", () => {
    expect(is_plain_enter(make_event())).toBe(true);
  });

  it("rejects Shift+Enter", () => {
    expect(is_plain_enter(make_event({ shiftKey: true }))).toBe(false);
  });

  it("rejects Alt+Enter", () => {
    expect(is_plain_enter(make_event({ altKey: true }))).toBe(false);
  });

  it("rejects Ctrl+Enter", () => {
    expect(is_plain_enter(make_event({ ctrlKey: true }))).toBe(false);
  });

  it("rejects Cmd+Enter", () => {
    expect(is_plain_enter(make_event({ metaKey: true }))).toBe(false);
  });

  it("rejects Enter during IME composition", () => {
    expect(is_plain_enter(make_event({ isComposing: true }))).toBe(false);
  });

  it("rejects other keys", () => {
    expect(is_plain_enter(make_event({ key: "a" }))).toBe(false);
  });
});
