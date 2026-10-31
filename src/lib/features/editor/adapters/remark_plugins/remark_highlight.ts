import type { Root, Parents, PhrasingContent, Text } from "mdast";
import type { Plugin } from "unified";
import {
  findAndReplace,
  type RegExpMatchObject,
} from "mdast-util-find-and-replace";

export const remark_highlight: Plugin<[], Root> = () => {
  return (tree: Root, file) => {
    const source = String(file.value);
    findAndReplace(tree, [
      [
        /==([\s\S]+?)==/g,
        (match: string, text: string, { index, stack }: RegExpMatchObject) =>
          has_escaped_delimiter(source, stack.at(-1), index, match.length)
            ? false
            : ({
                type: "highlight",
                children: [{ type: "text", value: text }],
              } as unknown as PhrasingContent),
      ],
    ]);
  };
};

// The parser has already dropped the backslash from `\==`, so whether a
// delimiter was escaped is read back from the text node's source, pairing
// each `=` in the value with the `=` at the same ordinal in the source.
function has_escaped_delimiter(
  source: string,
  node: Text | Parents | undefined,
  index: number,
  length: number,
): boolean {
  if (node?.type !== "text") return false;
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return false;
  const escaped = escaped_equals(source.slice(start, end));
  if (escaped.length !== count_equals(node.value)) return false;
  const opener = count_equals(node.value.slice(0, index));
  const closer = count_equals(node.value.slice(0, index + length - 2));
  return [opener, opener + 1, closer, closer + 1].some((k) => escaped[k]);
}

function escaped_equals(raw: string): boolean[] {
  const escaped: boolean[] = [];
  let backslashes = 0;
  for (const ch of raw) {
    if (ch === "=") escaped.push(backslashes % 2 === 1);
    backslashes = ch === "\\" ? backslashes + 1 : 0;
  }
  return escaped;
}

function count_equals(value: string): number {
  return value.split("=").length - 1;
}

export const highlight_to_markdown = {
  highlight(
    node: { children: unknown },
    _parent: unknown,
    state: {
      enter: (s: string) => () => void;
      containerPhrasing: (n: unknown, i: unknown) => string;
    },
    info: unknown,
  ): string {
    const exit = state.enter("highlight");
    const value = state.containerPhrasing(node, info);
    exit();
    return `==${value}==`;
  },
};
