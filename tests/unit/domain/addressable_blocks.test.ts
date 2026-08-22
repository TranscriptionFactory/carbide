import { describe, expect, it } from "vitest";
import { collect_addressable_blocks } from "$lib/features/editor/domain/addressable_blocks";
import { mint_block_in_markdown } from "$lib/features/editor/application/editor_service";

function expected_block(
  markdown: string,
  text: string,
  block_id: string | null = null,
) {
  const end_offset = markdown.lastIndexOf(text) + text.length;
  return {
    text: block_id ? text.replace(` ^${block_id}`, "") : text,
    end_line: markdown.slice(0, end_offset).split("\n").length,
    end_offset,
    block_id,
  };
}

describe("addressable blocks", () => {
  const cases = [
    ["an ordinary paragraph\n", "an ordinary paragraph"],
    ["- outer\n  - nested list item\n", "nested list item"],
    ["> quoted paragraph\n", "quoted paragraph"],
    ["> [!note]\n> callout body\n", "callout body"],
    [
      "<details>\n<summary>Title</summary>\n\nmultiline details\nbody\n\n</details>\n",
      "multiline details\nbody",
    ],
    [
      "<details><summary>Title</summary>self-contained body</details>\n",
      "self-contained body",
    ],
    [
      "<details><summary>repeated text</summary>repeated text</details>\n",
      "repeated text",
    ],
    [
      "<details>\n<summary>Title</summary>\n\n> [!note]\n> nested callout body\n\n</details>\n",
      "nested callout body",
    ],
    [
      "> [!note]\n> <details><summary>Title</summary>nested details body</details>\n",
      "nested details body",
    ],
  ] as const;

  it.each(cases)("discovers and mints %s", (markdown, text) => {
    const expected = expected_block(markdown, text);
    expect(collect_addressable_blocks(markdown)).toContainEqual(expected);

    expect(
      mint_block_in_markdown(
        markdown,
        { ...expected, note_path: "target.md" },
        "mint01",
      ),
    ).toBe(
      `${markdown.slice(0, expected.end_offset)} ^mint01${markdown.slice(expected.end_offset)}`,
    );
  });

  it("preserves existing ids and their absolute coordinates", () => {
    const markdown =
      "before\n\n<details><summary>Title</summary>kept ^keep01</details>\n";
    expect(collect_addressable_blocks(markdown)).toEqual([
      expected_block(markdown, "before"),
      expected_block(markdown, "kept ^keep01", "keep01"),
    ]);
  });

  it("excludes non-addressable constructs and container labels", () => {
    const markdown = [
      "---",
      "title: frontmatter",
      "---",
      "",
      "# heading",
      "",
      "```ts",
      "code",
      "```",
      "",
      "| table | value |",
      "| --- | --- |",
      "| cell | value |",
      "",
      "![[embed]]",
      "",
      "<details><summary>summary title</summary>details body</details>",
      "",
      "> [!note] callout title",
      "> callout body",
    ].join("\n");

    expect(
      collect_addressable_blocks(markdown).map((block) => block.text),
    ).toEqual(["details body", "callout body"]);
  });
});
