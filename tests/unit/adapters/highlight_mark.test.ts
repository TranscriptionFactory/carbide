import { describe, it, expect } from "vitest";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

describe("highlight mark", () => {
  it("schema includes highlight mark", () => {
    expect(schema.marks.highlight).toBeTruthy();
  });

  it("parses ==text== to highlight mark", () => {
    const doc = parse_markdown("This has ==highlighted== text");
    const para = doc.firstChild!;
    let found = false;
    para.forEach((node) => {
      if (
        node.text === "highlighted" &&
        node.marks.some((m) => m.type.name === "highlight")
      ) {
        found = true;
      }
    });
    expect(found).toBe(true);
  });

  it("round-trips highlight mark through serialize", () => {
    const input = "This has ==highlighted== text";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).toBe(input);
  });
});
