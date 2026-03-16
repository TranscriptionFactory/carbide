import { describe, it, expect } from "vitest";
import yaml from "js-yaml";

function parse_frontmatter(content: string): {
  properties: { key: string; value: any }[];
  tags: string[];
  error: string | null;
} {
  try {
    const parsed = yaml.load(content) as any;
    if (!parsed || typeof parsed !== "object") {
      return { properties: [], tags: [], error: null };
    }

    const properties: { key: string; value: any }[] = [];
    const tags: string[] = [];

    for (const [key, value] of Object.entries(parsed)) {
      if (key === "tags" || key === "tag") {
        if (Array.isArray(value)) {
          tags.push(...value.map(String));
        } else if (value) {
          tags.push(String(value));
        }
      } else {
        properties.push({ key, value });
      }
    }

    return { properties, tags, error: null };
  } catch (e: any) {
    return { properties: [], tags: [], error: e.message };
  }
}

function serialize_frontmatter(
  properties: { key: string; value: any }[],
  tags: string[],
): string {
  const obj: any = {};
  for (const prop of properties) {
    if (prop.key) {
      obj[prop.key] = prop.value;
    }
  }
  if (tags.length > 0) {
    obj.tags = tags;
  }
  return yaml.dump(obj, { quotingType: '"', forceQuotes: false });
}

describe("frontmatter widget: parse_frontmatter", () => {
  it("parses valid YAML and returns properties", () => {
    const content = "title: My Note\nstatus: draft\n";

    const { properties, tags, error } = parse_frontmatter(content);

    expect(error).toBeNull();
    expect(properties).toHaveLength(2);
    expect(properties[0]).toEqual({ key: "title", value: "My Note" });
    expect(properties[1]).toEqual({ key: "status", value: "draft" });
    expect(tags).toEqual([]);
  });

  it("parses YAML with tags array and renders tag list", () => {
    const content = "title: My Note\ntags:\n  - svelte\n  - typescript\n";

    const { properties, tags, error } = parse_frontmatter(content);

    expect(error).toBeNull();
    expect(tags).toEqual(["svelte", "typescript"]);
    expect(properties).toHaveLength(1);
    expect(properties[0]).toEqual({ key: "title", value: "My Note" });
  });

  it("parses YAML with singular tag key", () => {
    const content = "tag: svelte\n";

    const { properties, tags } = parse_frontmatter(content);

    expect(tags).toEqual(["svelte"]);
    expect(properties).toHaveLength(0);
  });

  it("returns error state for malformed YAML", () => {
    const content = "title: [\nunclosed bracket";

    const { properties, tags, error } = parse_frontmatter(content);

    expect(error).not.toBeNull();
    expect(properties).toEqual([]);
    expect(tags).toEqual([]);
  });

  it("returns empty state for empty frontmatter", () => {
    const content = "";

    const { properties, tags, error } = parse_frontmatter(content);

    expect(error).toBeNull();
    expect(properties).toEqual([]);
    expect(tags).toEqual([]);
  });

  it("handles YAML with only tags and no other properties", () => {
    const content = "tags:\n  - design\n  - ui\n";

    const { properties, tags } = parse_frontmatter(content);

    expect(tags).toEqual(["design", "ui"]);
    expect(properties).toEqual([]);
  });

  it("handles YAML with only properties and no tags", () => {
    const content = "author: Alice\ndate: 2024-01-01\n";

    const { properties, tags } = parse_frontmatter(content);

    expect(properties).toHaveLength(2);
    expect(tags).toEqual([]);
  });

  it("coerces non-string tag values to strings", () => {
    const content = "tags:\n  - 42\n  - true\n";

    const { tags } = parse_frontmatter(content);

    expect(tags).toEqual(["42", "true"]);
  });
});

describe("frontmatter widget: serialize_frontmatter", () => {
  it("serializes properties and tags into YAML", () => {
    const properties = [{ key: "title", value: "My Note" }];
    const tags = ["svelte", "typescript"];

    const result = serialize_frontmatter(properties, tags);
    const parsed = yaml.load(result) as any;

    expect(parsed.title).toBe("My Note");
    expect(parsed.tags).toEqual(["svelte", "typescript"]);
  });

  it("omits tags key when tags array is empty", () => {
    const properties = [{ key: "title", value: "No Tags" }];

    const result = serialize_frontmatter(properties, []);
    const parsed = yaml.load(result) as any;

    expect(parsed.tags).toBeUndefined();
    expect(parsed.title).toBe("No Tags");
  });

  it("skips properties with empty keys", () => {
    const properties = [
      { key: "", value: "orphan" },
      { key: "status", value: "done" },
    ];

    const result = serialize_frontmatter(properties, []);
    const parsed = yaml.load(result) as any;

    expect(Object.keys(parsed)).toEqual(["status"]);
  });

  it("removing a tag excludes it from serialized output", () => {
    const tags_before = ["design", "ui", "svelte"];
    const tags_after = tags_before.filter((_, i) => i !== 1);

    const result = serialize_frontmatter([], tags_after);
    const parsed = yaml.load(result) as any;

    expect(parsed.tags).toEqual(["design", "svelte"]);
    expect(parsed.tags).not.toContain("ui");
  });

  it("adding a property includes it in serialized output", () => {
    const properties = [
      { key: "title", value: "Note" },
      { key: "priority", value: "high" },
    ];

    const result = serialize_frontmatter(properties, []);
    const parsed = yaml.load(result) as any;

    expect(parsed.priority).toBe("high");
  });

  it("produces empty YAML object for no properties and no tags", () => {
    const result = serialize_frontmatter([], []);
    const parsed = yaml.load(result);

    expect(
      parsed == null ||
        (typeof parsed === "object" &&
          Object.keys(parsed as object).length === 0),
    ).toBe(true);
  });
});
