import type { Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { parse_inline_html_tag } from "$lib/shared/html";

type MdNode = {
  type: string;
  value?: string;
  open?: string;
  close?: string;
  inner?: boolean;
  children?: MdNode[];
};

type Frame = { open: MdNode; name: string; children: MdNode[] };

const PHRASING_PARENTS = new Set([
  "paragraph",
  "heading",
  "tableCell",
  "emphasis",
  "strong",
  "delete",
  "link",
  "highlight",
  "inlineHtml",
]);

const MARK_PARENTS = new Set([
  "emphasis",
  "strong",
  "delete",
  "link",
  "highlight",
]);

function unwind(frames: Frame[]): MdNode[] {
  return frames.flatMap((frame) => [frame.open, ...frame.children]);
}

function to_pair(frame: Frame, close: MdNode): MdNode {
  return {
    type: "inlineHtml",
    open: frame.open.value ?? "",
    close: close.value ?? "",
    inner: false,
    children: frame.children,
  };
}

function pair_children(children: MdNode[]): MdNode[] {
  const root: MdNode[] = [];
  let frames: Frame[] = [];
  for (const child of children) {
    const tag =
      child.type === "html" ? parse_inline_html_tag(child.value ?? "") : null;
    const frame = frames.at(-1);
    if (tag?.kind === "open") {
      frames.push({ open: child, name: tag.name, children: [] });
    } else if (tag?.kind === "close" && frame?.name === tag.name) {
      frames.pop();
      (frames.at(-1)?.children ?? root).push(to_pair(frame, child));
    } else if (tag?.kind === "close") {
      root.push(...unwind(frames), child);
      frames = [];
    } else {
      (frame?.children ?? root).push(child);
    }
  }
  return [...root, ...unwind(frames)];
}

// A pair that is the only child of a mark covers the same text as that mark,
// so ProseMirror cannot tell which one was outermost. `inner` records it.
function covers_parent_mark(parent: MdNode): boolean {
  return (
    MARK_PARENTS.has(parent.type) ||
    (parent.type === "inlineHtml" && parent.inner === true)
  );
}

export const remark_inline_html: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, (node) => {
      const parent = node as MdNode;
      if (!PHRASING_PARENTS.has(parent.type) || !parent.children) return;
      parent.children = pair_children(parent.children);
      const only = parent.children.length === 1 ? parent.children[0] : null;
      if (only?.type === "inlineHtml" && covers_parent_mark(parent)) {
        only.inner = true;
      }
    });
  };
};

export const inline_html_to_markdown = {
  inlineHtml(
    node: { open: string; close: string },
    _parent: unknown,
    state: { containerPhrasing: (n: unknown, i: unknown) => string },
    info: object,
  ): string {
    const value = state.containerPhrasing(node, {
      ...info,
      before: ">",
      after: "<",
    });
    return `${node.open}${value}${node.close}`;
  },
};
