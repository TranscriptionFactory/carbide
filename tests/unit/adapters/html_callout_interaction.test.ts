import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

const CALLOUT = `> [!warning] Watch out
> This is a warning
>
> ---
>
> ## Heading in callout
> Some text`;

describe("HTML block + callout interaction", () => {
  it("keeps callout with divider and headings below an embed block", () => {
    const input = `<iframe src="https://example.com"></iframe>\n\n${CALLOUT}`;
    const doc = parse_markdown(input);
    expect(doc.child(0).type.name).toBe("web_embed");
    expect(doc.child(1).type.name).toBe("callout");

    const body = doc.child(1).child(1);
    const body_types: string[] = [];
    body.forEach((child) => body_types.push(child.type.name));
    expect(body_types).toEqual(["paragraph", "hr", "heading", "paragraph"]);

    const once = serialize_markdown(doc);
    expect(once).toContain("<iframe");
    expect(once).toContain("[!warning] Watch out");
    expect(once).toContain("> ---");
    expect(once).toContain("## Heading in callout");
    expect(serialize_markdown(parse_markdown(once))).toBe(once);
  });

  it("preserves callout content verbatim inside a swallowing HTML block", () => {
    const input = `<div class="x">\n${CALLOUT}`;
    const doc = parse_markdown(input);
    expect(doc.child(0).type.name).toBe("raw_block");
    expect(doc.child(0).textContent).toBe(input);

    const once = serialize_markdown(doc);
    expect(once.trimEnd()).toBe(input);
    expect(serialize_markdown(parse_markdown(once))).toBe(once);
  });
});
