import { describe, it, expect } from "vitest";
import { serialize_markdown } from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";
import { pm_to_mdast } from "$lib/features/editor/adapters/pm_to_mdast";
import { stringify_processor } from "$lib/features/editor/adapters/remark_plugins/remark_processor";

describe("paragraph trailing whitespace", () => {
  it("trims trailing whitespace to avoid &#x20;", () => {
    const paragraph = schema.nodes.paragraph.create(null, schema.text("word "));
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const tree = pm_to_mdast(doc);
    const output = stringify_processor.stringify(tree) as string;
    expect(output).not.toContain("&#x20;");
    expect(output.trim()).toBe("word");
  });

  it("trims multiple trailing spaces", () => {
    const paragraph = schema.nodes.paragraph.create(
      null,
      schema.text("hello world  "),
    );
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const output = serialize_markdown(doc);
    expect(output).not.toContain("&#");
    expect(output.trim()).toBe("hello world");
  });

  it("preserves content without trailing space", () => {
    const paragraph = schema.nodes.paragraph.create(
      null,
      schema.text("no trailing"),
    );
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const output = serialize_markdown(doc);
    expect(output.trim()).toBe("no trailing");
  });
});
