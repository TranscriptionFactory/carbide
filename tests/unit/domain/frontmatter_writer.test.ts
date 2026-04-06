import { describe, expect, it } from "vitest";
import {
  ensure_frontmatter,
  update_frontmatter_property,
  add_frontmatter_property,
  remove_frontmatter_property,
} from "$lib/features/metadata/domain/frontmatter_writer";

describe("ensure_frontmatter", () => {
  it("adds empty frontmatter to plain markdown", () => {
    expect(ensure_frontmatter("Hello world")).toBe("---\n---\nHello world");
  });

  it("returns unchanged if frontmatter already exists", () => {
    const md = "---\ntitle: Test\n---\nHello";
    expect(ensure_frontmatter(md)).toBe(md);
  });

  it("adds frontmatter to empty string", () => {
    expect(ensure_frontmatter("")).toBe("---\n---\n");
  });

  it("preserves existing empty frontmatter", () => {
    const md = "---\n---\nContent";
    expect(ensure_frontmatter(md)).toBe(md);
  });
});

describe("add_frontmatter_property", () => {
  it("adds a string property to existing frontmatter", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const result = add_frontmatter_property(md, "author", "Jane");
    expect(result).toBe("---\ntitle: Test\nauthor: Jane\n---\nBody");
  });

  it("adds a property to empty frontmatter", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "title", "Hello");
    expect(result).toBe("---\ntitle: Hello\n---\nBody");
  });

  it("creates frontmatter if none exists", () => {
    const md = "Just body text";
    const result = add_frontmatter_property(md, "title", "Hello");
    expect(result).toBe("---\ntitle: Hello\n---\nJust body text");
  });

  it("adds a number property", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const result = add_frontmatter_property(md, "rating", 5);
    expect(result).toBe("---\ntitle: Test\nrating: 5\n---\nBody");
  });

  it("adds a boolean property", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const result = add_frontmatter_property(md, "draft", true);
    expect(result).toBe("---\ntitle: Test\ndraft: true\n---\nBody");
  });

  it("adds null property", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const result = add_frontmatter_property(md, "status", null);
    expect(result).toBe("---\ntitle: Test\nstatus: null\n---\nBody");
  });

  it("adds a short array inline", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const result = add_frontmatter_property(md, "tags", ["a", "b"]);
    expect(result).toBe("---\ntitle: Test\ntags: [a, b]\n---\nBody");
  });

  it("adds a long array multi-line", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const result = add_frontmatter_property(md, "tags", [
      "one",
      "two",
      "three",
      "four",
    ]);
    expect(result).toBe(
      "---\ntitle: Test\ntags: \n  - one\n  - two\n  - three\n  - four\n---\nBody",
    );
  });

  it("adds empty array", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const result = add_frontmatter_property(md, "tags", []);
    expect(result).toBe("---\ntitle: Test\ntags: []\n---\nBody");
  });

  it("delegates to update if key already exists", () => {
    const md = "---\ntitle: Old\n---\nBody";
    const result = add_frontmatter_property(md, "title", "New");
    expect(result).toBe("---\ntitle: New\n---\nBody");
  });

  it("quotes strings containing colons", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "subtitle", "Note: important");
    expect(result).toBe('---\nsubtitle: "Note: important"\n---\nBody');
  });

  it("quotes strings containing hash", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "channel", "#general");
    expect(result).toBe('---\nchannel: "#general"\n---\nBody');
  });

  it("quotes strings that look like booleans", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "answer", "true");
    expect(result).toBe('---\nanswer: "true"\n---\nBody');
  });

  it("quotes strings that look like null", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "val", "null");
    expect(result).toBe('---\nval: "null"\n---\nBody');
  });

  it("quotes empty strings", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "val", "");
    expect(result).toBe('---\nval: ""\n---\nBody');
  });

  it("handles strings with double quotes by escaping", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "quote", 'He said "hello"');
    expect(result).toBe('---\nquote: "He said \\"hello\\""\n---\nBody');
  });
});

describe("update_frontmatter_property", () => {
  it("updates an existing string property", () => {
    const md = "---\ntitle: Old\nauthor: Jane\n---\nBody";
    const result = update_frontmatter_property(md, "title", "New");
    expect(result).toBe("---\ntitle: New\nauthor: Jane\n---\nBody");
  });

  it("updates middle property preserving others", () => {
    const md = "---\na: 1\nb: 2\nc: 3\n---\nBody";
    const result = update_frontmatter_property(md, "b", 99);
    expect(result).toBe("---\na: 1\nb: 99\nc: 3\n---\nBody");
  });

  it("updates last property", () => {
    const md = "---\na: 1\nb: 2\n---\nBody";
    const result = update_frontmatter_property(md, "b", "updated");
    expect(result).toBe("---\na: 1\nb: updated\n---\nBody");
  });

  it("falls back to add if key does not exist", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const result = update_frontmatter_property(md, "author", "Jane");
    expect(result).toBe("---\ntitle: Test\nauthor: Jane\n---\nBody");
  });

  it("creates frontmatter if none exists", () => {
    const md = "Body text";
    const result = update_frontmatter_property(md, "title", "Hello");
    expect(result).toBe("---\ntitle: Hello\n---\nBody text");
  });

  it("updates boolean to string", () => {
    const md = "---\ndraft: true\n---\nBody";
    const result = update_frontmatter_property(md, "draft", "published");
    expect(result).toBe("---\ndraft: published\n---\nBody");
  });

  it("updates string to array", () => {
    const md = "---\ntags: old\n---\nBody";
    const result = update_frontmatter_property(md, "tags", ["a", "b"]);
    expect(result).toBe("---\ntags: [a, b]\n---\nBody");
  });

  it("updates to null", () => {
    const md = "---\nstatus: active\n---\nBody";
    const result = update_frontmatter_property(md, "status", null);
    expect(result).toBe("---\nstatus: null\n---\nBody");
  });

  it("handles property with no space after colon", () => {
    const md = "---\ntitle:Old\n---\nBody";
    const result = update_frontmatter_property(md, "title", "New");
    expect(result).toBe("---\ntitle: New\n---\nBody");
  });

  it("replaces multi-line array value with scalar", () => {
    const md =
      "---\ntags:\n  - one\n  - two\n  - three\nauthor: Jane\n---\nBody";
    const result = update_frontmatter_property(md, "tags", "single");
    expect(result).toBe("---\ntags: single\nauthor: Jane\n---\nBody");
  });
});

describe("remove_frontmatter_property", () => {
  it("removes a property from frontmatter", () => {
    const md = "---\ntitle: Test\nauthor: Jane\n---\nBody";
    const result = remove_frontmatter_property(md, "author");
    expect(result).toBe("---\ntitle: Test\n---\nBody");
  });

  it("removes the only property leaving empty frontmatter", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const result = remove_frontmatter_property(md, "title");
    expect(result).toBe("---\n---\nBody");
  });

  it("removes first property", () => {
    const md = "---\na: 1\nb: 2\nc: 3\n---\nBody";
    const result = remove_frontmatter_property(md, "a");
    expect(result).toBe("---\nb: 2\nc: 3\n---\nBody");
  });

  it("removes middle property", () => {
    const md = "---\na: 1\nb: 2\nc: 3\n---\nBody";
    const result = remove_frontmatter_property(md, "b");
    expect(result).toBe("---\na: 1\nc: 3\n---\nBody");
  });

  it("removes last property", () => {
    const md = "---\na: 1\nb: 2\n---\nBody";
    const result = remove_frontmatter_property(md, "b");
    expect(result).toBe("---\na: 1\n---\nBody");
  });

  it("returns unchanged if no frontmatter", () => {
    const md = "Body text only";
    expect(remove_frontmatter_property(md, "title")).toBe(md);
  });

  it("returns unchanged if key not found", () => {
    const md = "---\ntitle: Test\n---\nBody";
    expect(remove_frontmatter_property(md, "missing")).toBe(md);
  });

  it("removes property with multi-line array value", () => {
    const md =
      "---\ntags:\n  - one\n  - two\n  - three\nauthor: Jane\n---\nBody";
    const result = remove_frontmatter_property(md, "tags");
    expect(result).toBe("---\nauthor: Jane\n---\nBody");
  });
});

describe("round-trip preservation", () => {
  it("preserves body content after frontmatter operations", () => {
    const md = "---\ntitle: Test\n---\n\n# Heading\n\nParagraph text.\n";
    const result = update_frontmatter_property(md, "title", "Updated");
    expect(result).toContain("# Heading");
    expect(result).toContain("Paragraph text.");
  });

  it("preserves other properties during update", () => {
    const md = "---\na: 1\nb: 2\nc: 3\nd: 4\n---\nBody";
    const result = update_frontmatter_property(md, "b", "new");
    expect(result).toContain("a: 1");
    expect(result).toContain("b: new");
    expect(result).toContain("c: 3");
    expect(result).toContain("d: 4");
  });

  it("add then remove returns to original structure", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const added = add_frontmatter_property(md, "author", "Jane");
    const removed = remove_frontmatter_property(added, "author");
    expect(removed).toBe(md);
  });

  it("handles multiple sequential operations", () => {
    let md = "---\n---\nBody";
    md = add_frontmatter_property(md, "title", "Hello");
    md = add_frontmatter_property(md, "draft", true);
    md = add_frontmatter_property(md, "tags", ["a", "b"]);
    md = update_frontmatter_property(md, "title", "Updated");
    md = remove_frontmatter_property(md, "draft");

    expect(md).toContain("title: Updated");
    expect(md).not.toContain("draft");
    expect(md).toContain("tags: [a, b]");
    expect(md).toContain("Body");
  });
});

describe("edge cases", () => {
  it("handles frontmatter with trailing spaces on delimiters", () => {
    const md = "---   \ntitle: Test\n---   \nBody";
    const result = update_frontmatter_property(md, "title", "New");
    expect(result).toContain("title: New");
  });

  it("handles property keys with special regex chars", () => {
    const md = "---\nmy.key: value\n---\nBody";
    const result = update_frontmatter_property(md, "my.key", "new");
    expect(result).toContain("my.key: new");
  });

  it("handles date values as strings", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "created", "2026-04-05");
    expect(result).toBe("---\ncreated: 2026-04-05\n---\nBody");
  });

  it("handles values with backslashes", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "path", "C:\\Users\\test");
    expect(result).toContain("path:");
  });

  it("handles array of numbers", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "scores", [1, 2, 3]);
    expect(result).toBe("---\nscores: [1, 2, 3]\n---\nBody");
  });

  it("handles array with items needing quotes", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "items", ["a: b", "c: d"]);
    expect(result).toBe('---\nitems: ["a: b", "c: d"]\n---\nBody');
  });

  it("does not match partial key names", () => {
    const md = "---\ntitle: Test\nsubtitle: Sub\n---\nBody";
    const result = update_frontmatter_property(md, "title", "New");
    expect(result).toContain("title: New");
    expect(result).toContain("subtitle: Sub");
  });

  it("handles markdown with no trailing newline", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const result = update_frontmatter_property(md, "title", "New");
    expect(result).toContain("title: New");
    expect(result).toContain("Body");
  });

  it("handles strings with curly braces", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "template", "{name}");
    expect(result).toBe('---\ntemplate: "{name}"\n---\nBody');
  });

  it("handles strings with square brackets", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "ref", "[link]");
    expect(result).toBe('---\nref: "[link]"\n---\nBody');
  });

  it("plain strings are not quoted", () => {
    const md = "---\n---\nBody";
    const result = add_frontmatter_property(md, "title", "A simple title");
    expect(result).toBe("---\ntitle: A simple title\n---\nBody");
  });
});
