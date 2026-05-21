import type { Root, ListItem, Paragraph, Text } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

const DOING_RE = /^\[[-/]\]\s*/;

export const remark_task_doing: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "listItem", (node: ListItem) => {
      if (node.checked != null) return;

      const para = node.children[0];
      if (!para || para.type !== "paragraph") return;

      const text_node = para.children[0];
      if (!text_node || text_node.type !== "text") return;

      const match = DOING_RE.exec(text_node.value);
      if (!match) return;

      text_node.value = text_node.value.slice(match[0].length);
      node.checked = false;
      if (!node.data) node.data = {};
      (node.data as Record<string, unknown>).taskStatus = "doing";
    });
  };
};
