import type { Root, PhrasingContent } from "mdast";
import type { Plugin } from "unified";
import { findAndReplace } from "mdast-util-find-and-replace";

export const remark_highlight: Plugin<[], Root> = () => {
  return (tree: Root) => {
    findAndReplace(tree, [
      [
        /==([\s\S]+?)==/g,
        (_match: string, text: string): PhrasingContent =>
          ({
            type: "highlight",
            children: [{ type: "text", value: text }],
          }) as unknown as PhrasingContent,
      ],
    ]);
  };
};

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
