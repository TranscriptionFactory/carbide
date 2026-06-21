import { describe, expect, it } from "vitest";
import {
  build_key_suggestions,
  value_suggestions_for_key,
} from "$lib/features/metadata/domain/property_suggestions";
import type {
  StandardField,
  VaultProperty,
} from "$lib/features/metadata/types";

const STANDARD: StandardField[] = [
  {
    key: "status",
    type: "string",
    description: "Workflow status",
    values: ["todo", "in-progress", "done"],
    keywords: ["state", "workflow"],
  },
  { key: "title", type: "string", description: "Display title" },
];

const VAULT: VaultProperty[] = [
  {
    name: "status",
    property_type: "string",
    count: 12,
    unique_values: ["done", "blocked"],
  },
  {
    name: "author",
    property_type: "string",
    count: 3,
    unique_values: ["alice"],
  },
];

describe("build_key_suggestions", () => {
  it("merges standard catalog with vault keys and augments counts", () => {
    const result = build_key_suggestions("", VAULT, [], STANDARD);
    const status = result.find((s) => s.key === "status");
    const author = result.find((s) => s.key === "author");

    expect(status).toMatchObject({ source: "standard", count: 12 });
    expect(author).toMatchObject({ source: "vault", count: 3 });
  });

  it("orders standard fields before vault-only keys when query is empty", () => {
    const result = build_key_suggestions("", VAULT, [], STANDARD);
    const standard_first = result.filter((s) => s.source === "standard");
    const vault_first_index = result.findIndex((s) => s.source === "vault");
    expect(
      result
        .slice(0, standard_first.length)
        .every((s) => s.source === "standard"),
    ).toBe(true);
    expect(vault_first_index).toBeGreaterThanOrEqual(standard_first.length);
  });

  it("excludes keys already present on the note", () => {
    const result = build_key_suggestions("", VAULT, ["status"], STANDARD);
    expect(result.find((s) => s.key === "status")).toBeUndefined();
  });

  it("fuzzy-matches keys and returns highlight indices", () => {
    const result = build_key_suggestions("ttl", VAULT, [], STANDARD);
    expect(result[0]?.key).toBe("title");
    expect(result[0]?.indices.length).toBeGreaterThan(0);
  });

  it("matches via keywords even when the key does not contain the query", () => {
    const result = build_key_suggestions("workflow", VAULT, [], STANDARD);
    expect(result.map((s) => s.key)).toContain("status");
  });

  it("returns nothing when query matches no key or keyword", () => {
    const result = build_key_suggestions("zzzzz", VAULT, [], STANDARD);
    expect(result).toEqual([]);
  });
});

describe("value_suggestions_for_key", () => {
  it("unions catalog enum values with vault distinct values, deduped", () => {
    const result = value_suggestions_for_key("status", "", VAULT, STANDARD);
    const values = result.map((v) => v.value);
    expect(values).toContain("todo");
    expect(values).toContain("blocked");
    expect(values.filter((v) => v === "done")).toHaveLength(1);
  });

  it("fuzzy-filters values by query with highlight indices", () => {
    const result = value_suggestions_for_key("status", "prog", VAULT, STANDARD);
    expect(result[0]?.value).toBe("in-progress");
    expect(result[0]?.indices.length).toBeGreaterThan(0);
  });

  it("returns empty when the key has no known values", () => {
    const result = value_suggestions_for_key("title", "", VAULT, STANDARD);
    expect(result).toEqual([]);
  });
});
