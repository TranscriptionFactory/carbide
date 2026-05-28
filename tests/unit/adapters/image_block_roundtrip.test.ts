import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";

describe("image-block serialization", () => {
  it("preserves blank lines between sibling blocks when an image-block is present", () => {
    const heading_1 = schema.nodes.heading.create(
      { level: 1 },
      schema.text("Thursday, May 28, 2026"),
    );
    const heading_2 = schema.nodes.heading.create(
      { level: 2 },
      schema.text("To-do"),
    );
    const code_block = schema.nodes.code_block.create(
      { language: "tasks" },
      schema.text("- task"),
    );
    const image_block = schema.nodes["image-block"]!.create({
      src: "banner.png",
      caption: "",
      alt: "banner",
    });
    const doc = schema.nodes.doc.create(null, [
      heading_1,
      heading_2,
      code_block,
      image_block,
      schema.nodes.paragraph.create(),
    ]);

    const output = serialize_markdown(doc);
    expect(output).toContain("# Thursday, May 28, 2026\n\n## To-do");
    expect(output).toContain("## To-do\n\n```tasks");
    expect(output).toContain("```\n\n![banner](banner.png)");
  });

  it("round-trips a document containing an image-block", () => {
    const input =
      "# Title\n\n## Sub\n\n```tasks\n- a\n```\n\n![pic](pic.png)\n";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc);
    expect(output).toBe(input);
  });
});
