import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

describe("code_block meta serialization", () => {
  it("round-trips the fence info string after the language", () => {
    const input = "```js live\nconsole.log(1);\n```";
    const doc = parse_markdown(input);
    const code = doc.child(0);
    expect(code.type.name).toBe("code_block");
    expect(code.attrs["language"]).toBe("js");
    expect(code.attrs["meta"]).toBe("live");

    const output = serialize_markdown(doc);
    expect(output.trim()).toBe(input);
  });

  it("omits the trailing space when there is no meta", () => {
    const input = "```js\nconsole.log(1);\n```";
    const doc = parse_markdown(input);
    expect(doc.child(0).attrs["meta"]).toBe("");
    expect(serialize_markdown(doc).trim()).toBe(input);
  });

  it("preserves multi-token meta strings", () => {
    const input = "```html preview title=Demo\n<p>hi</p>\n```";
    const doc = parse_markdown(input);
    expect(doc.child(0).attrs["meta"]).toBe("preview title=Demo");
    expect(serialize_markdown(doc).trim()).toBe(input);
  });
});
