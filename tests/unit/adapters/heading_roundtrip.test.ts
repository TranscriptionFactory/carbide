import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";
import { pm_to_mdast } from "$lib/features/editor/adapters/pm_to_mdast";
import { stringify_processor } from "$lib/features/editor/adapters/remark_plugins/remark_processor";

describe("heading serialization", () => {
  it("round-trips heading without entity encoding", () => {
    const input = "# text";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc);
    expect(output.trim()).toBe(input);
    expect(output).not.toContain("&#");
  });

  it("trims trailing whitespace from heading to avoid &#x20;", () => {
    const heading = schema.nodes.heading.create(
      { level: 1 },
      schema.text("text "),
    );
    const doc = schema.nodes.doc.create(null, [heading]);
    const tree = pm_to_mdast(doc);
    const output = stringify_processor.stringify(tree) as string;
    expect(output).not.toContain("&#x20;");
    expect(output.trim()).toBe("# text");
  });

  it("trims trailing whitespace from h2", () => {
    const heading = schema.nodes.heading.create(
      { level: 2 },
      schema.text("hello world  "),
    );
    const doc = schema.nodes.doc.create(null, [heading]);
    const output = serialize_markdown(doc);
    expect(output).not.toContain("&#");
    expect(output.trim()).toBe("## hello world");
  });

  it("preserves heading content without trailing space", () => {
    const heading = schema.nodes.heading.create(
      { level: 1 },
      schema.text("no trailing"),
    );
    const doc = schema.nodes.doc.create(null, [heading]);
    const output = serialize_markdown(doc);
    expect(output.trim()).toBe("# no trailing");
  });
});
