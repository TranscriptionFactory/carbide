import { describe, expect, it } from "vitest";
import { key_suggestion_items } from "$lib/features/metadata/domain/suggestion_items";
import type { KeySuggestion } from "$lib/features/metadata/types";

function suggestion(overrides: Partial<KeySuggestion>): KeySuggestion {
  return {
    key: "status",
    type: "string",
    description: null,
    source: "vault",
    count: null,
    indices: [],
    ...overrides,
  };
}

describe("key_suggestion_items", () => {
  it("maps key, type, and indices onto combobox item fields", () => {
    const result = key_suggestion_items([
      suggestion({ key: "author", type: "array", indices: [0, 2] }),
    ]);
    expect(result).toEqual([
      { value: "author", hint: "array", description: null, indices: [0, 2] },
    ]);
  });

  it("prefers the standard-field description over the usage count", () => {
    const result = key_suggestion_items([
      suggestion({ description: "Workflow status", count: 5 }),
    ]);
    expect(result[0]?.description).toBe("Workflow status");
  });

  it("falls back to a pluralized usage count when there is no description", () => {
    const result = key_suggestion_items([
      suggestion({ count: 5 }),
      suggestion({ key: "author", count: 1 }),
    ]);
    expect(result[0]?.description).toBe("used in 5 notes");
    expect(result[1]?.description).toBe("used in 1 note");
  });

  it("yields a null description when neither description nor count exists", () => {
    const result = key_suggestion_items([suggestion({})]);
    expect(result[0]?.description).toBeNull();
  });
});
