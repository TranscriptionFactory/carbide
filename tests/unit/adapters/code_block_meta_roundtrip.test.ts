import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  fence_mode_from_meta,
  set_fence_mode_token,
} from "$lib/features/editor/adapters/code_preview";

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
  it("round-trips the nopreview token on an html fence", () => {
    const input = "```html nopreview\n<p>hi</p>\n```";
    const doc = parse_markdown(input);
    const code = doc.child(0);
    expect(code.type.name).toBe("code_block");
    expect(code.attrs["language"]).toBe("html");
    expect(code.attrs["meta"]).toBe("nopreview");
    expect(serialize_markdown(doc).trim()).toBe(input);
  });

  it("round-trips the live token on an html fence", () => {
    const input = "```html live\n<p>hi</p>\n```";
    const doc = parse_markdown(input);
    const code = doc.child(0);
    expect(code.attrs["language"]).toBe("html");
    expect(code.attrs["meta"]).toBe("live");
    expect(fence_mode_from_meta(code.attrs["meta"] as string)).toBe("live");
    expect(serialize_markdown(doc).trim()).toBe(input);
  });

  it("round-trips a live token written onto an existing info string", () => {
    const node = schema.nodes.code_block.create(
      { language: "html", meta: set_fence_mode_token("title=Demo", "live") },
      schema.text("<p>hi</p>"),
    );
    const output = serialize_markdown(
      schema.nodes.doc.create(null, [node]),
    ).trim();
    expect(output).toBe("```html title=Demo live\n<p>hi</p>\n```");
    const reparsed = parse_markdown(output);
    expect(
      fence_mode_from_meta(reparsed.child(0).attrs["meta"] as string),
    ).toBe("live");
  });

  it("round-trips an explicit safe token back to nothing", () => {
    const node = schema.nodes.code_block.create(
      { language: "html", meta: set_fence_mode_token("live", "safe") },
      schema.text("<p>hi</p>"),
    );
    const output = serialize_markdown(
      schema.nodes.doc.create(null, [node]),
    ).trim();
    expect(output).toBe("```html\n<p>hi</p>\n```");
    expect(
      fence_mode_from_meta(
        parse_markdown(output).child(0).attrs["meta"] as string,
      ),
    ).toBe("safe");
  });
});
