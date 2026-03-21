import { describe, it, expect } from "vitest";
import {
  parse_toml_string_array,
  parse_config,
  resolve_tags,
  split_frontmatter,
  is_in_heading,
  is_in_code_fence,
  apply_tags,
  auto_tag,
} from "../../../plugins/auto-tag/auto_tag.js";

const SAMPLE_TOML = `
# Auto-Tag config
[allow]
tags = [
  "todo",
  "fixme",
  "important",
  "review",
]

[deny]
tags = ["review"]
`;

describe("parse_toml_string_array", () => {
  it("extracts tags from a section", () => {
    expect(parse_toml_string_array(SAMPLE_TOML, "allow", "tags")).toEqual([
      "todo",
      "fixme",
      "important",
      "review",
    ]);
  });

  it("returns empty for missing section", () => {
    expect(parse_toml_string_array(SAMPLE_TOML, "missing", "tags")).toEqual([]);
  });

  it("returns empty for missing key", () => {
    expect(parse_toml_string_array(SAMPLE_TOML, "allow", "missing")).toEqual(
      [],
    );
  });

  it("handles single-quoted strings", () => {
    const toml = "[allow]\ntags = ['one', 'two']";
    expect(parse_toml_string_array(toml, "allow", "tags")).toEqual([
      "one",
      "two",
    ]);
  });

  it("handles empty array", () => {
    const toml = "[deny]\ntags = []";
    expect(parse_toml_string_array(toml, "deny", "tags")).toEqual([]);
  });

  it("handles inline array format", () => {
    const toml = '[allow]\ntags = ["a", "b", "c"]';
    expect(parse_toml_string_array(toml, "allow", "tags")).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("parse_config", () => {
  it("parses allow and deny lists", () => {
    const config = parse_config(SAMPLE_TOML);
    expect(config.allow).toEqual(["todo", "fixme", "important", "review"]);
    expect(config.deny).toEqual(["review"]);
  });

  it("returns empty arrays for minimal toml", () => {
    const config = parse_config("");
    expect(config.allow).toEqual([]);
    expect(config.deny).toEqual([]);
  });
});

describe("resolve_tags", () => {
  it("filters out denied tags", () => {
    const tags = resolve_tags({
      allow: ["todo", "fixme", "review"],
      deny: ["review"],
    });
    expect(tags).toEqual(["todo", "fixme"]);
  });

  it("lowercases all tags", () => {
    const tags = resolve_tags({ allow: ["TODO", "FixMe"], deny: [] });
    expect(tags).toEqual(["todo", "fixme"]);
  });

  it("deny is case-insensitive", () => {
    const tags = resolve_tags({
      allow: ["todo", "REVIEW"],
      deny: ["Review"],
    });
    expect(tags).toEqual(["todo"]);
  });

  it("filters empty strings", () => {
    const tags = resolve_tags({ allow: ["", "todo"], deny: [] });
    expect(tags).toEqual(["todo"]);
  });
});

describe("split_frontmatter", () => {
  it("splits frontmatter from body", () => {
    const md = "---\ntitle: Test\n---\nBody here";
    const result = split_frontmatter(md);
    expect(result.frontmatter).toBe("title: Test");
    expect(result.body).toBe("Body here");
    expect(result.raw_fm).toBe("---\ntitle: Test\n---\n");
  });

  it("handles no frontmatter", () => {
    const md = "Just a body";
    const result = split_frontmatter(md);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe("Just a body");
    expect(result.raw_fm).toBe("");
  });
});

describe("is_in_heading", () => {
  it("detects markdown headings", () => {
    expect(is_in_heading("# Heading")).toBe(true);
    expect(is_in_heading("## Heading")).toBe(true);
    expect(is_in_heading("###### Heading")).toBe(true);
  });

  it("rejects non-headings", () => {
    expect(is_in_heading("regular text")).toBe(false);
    expect(is_in_heading("#hashtag")).toBe(false);
    expect(is_in_heading("####### seven")).toBe(false);
  });
});

describe("is_in_code_fence", () => {
  it("detects lines inside code fences", () => {
    const lines = ["text", "```", "code here", "```", "after"];
    expect(is_in_code_fence(lines, 0)).toBe(false);
    expect(is_in_code_fence(lines, 2)).toBe(true);
    expect(is_in_code_fence(lines, 4)).toBe(false);
  });

  it("handles nested/multiple fences", () => {
    const lines = ["```", "a", "```", "b", "```", "c", "```"];
    expect(is_in_code_fence(lines, 1)).toBe(true);
    expect(is_in_code_fence(lines, 3)).toBe(false);
    expect(is_in_code_fence(lines, 5)).toBe(true);
  });
});

describe("apply_tags", () => {
  it("prefixes matching words with #", () => {
    expect(apply_tags("this is a todo item", ["todo"])).toBe(
      "this is a #todo item",
    );
  });

  it("matches case-insensitively", () => {
    expect(apply_tags("TODO and Todo", ["todo"])).toBe("#TODO and #Todo");
  });

  it("skips already-tagged words", () => {
    expect(apply_tags("already #todo here", ["todo"])).toBe(
      "already #todo here",
    );
  });

  it("skips words inside headings", () => {
    expect(apply_tags("# todo heading\ntodo body", ["todo"])).toBe(
      "# todo heading\n#todo body",
    );
  });

  it("skips words inside code fences", () => {
    const body = "before todo\n```\ntodo in code\n```\nafter todo";
    expect(apply_tags(body, ["todo"])).toBe(
      "before #todo\n```\ntodo in code\n```\nafter #todo",
    );
  });

  it("handles multiple tags", () => {
    expect(apply_tags("todo and fixme here", ["todo", "fixme"])).toBe(
      "#todo and #fixme here",
    );
  });

  it("handles word at start of line", () => {
    expect(apply_tags("todo", ["todo"])).toBe("#todo");
  });

  it("handles word at end of line", () => {
    expect(apply_tags("this is todo", ["todo"])).toBe("this is #todo");
  });

  it("does not match partial words", () => {
    expect(apply_tags("todolist and mytodo", ["todo"])).toBe(
      "todolist and mytodo",
    );
  });

  it("handles punctuation after tag", () => {
    expect(apply_tags("is this todo?", ["todo"])).toBe("is this #todo?");
    expect(apply_tags("mark as important.", ["important"])).toBe(
      "mark as #important.",
    );
  });

  it("returns unchanged body when no tags", () => {
    expect(apply_tags("no matches here", ["todo"])).toBe("no matches here");
  });

  it("returns unchanged body when tags list empty", () => {
    expect(apply_tags("todo here", [])).toBe("todo here");
  });
});

describe("auto_tag", () => {
  it("tags body while preserving frontmatter", () => {
    const md = "---\ntitle: Test\n---\nThis is a todo item";
    const toml = '[allow]\ntags = ["todo"]\n[deny]\ntags = []';
    expect(auto_tag(md, toml)).toBe(
      "---\ntitle: Test\n---\nThis is a #todo item",
    );
  });

  it("respects deny list", () => {
    const md = "todo and review here";
    const toml =
      '[allow]\ntags = ["todo", "review"]\n[deny]\ntags = ["review"]';
    expect(auto_tag(md, toml)).toBe("#todo and review here");
  });

  it("returns unchanged markdown when no tags configured", () => {
    const md = "some text";
    const toml = "[allow]\ntags = []\n[deny]\ntags = []";
    expect(auto_tag(md, toml)).toBe("some text");
  });

  it("handles markdown with no frontmatter", () => {
    const md = "just a todo note";
    const toml = '[allow]\ntags = ["todo"]\n[deny]\ntags = []';
    expect(auto_tag(md, toml)).toBe("just a #todo note");
  });
});
