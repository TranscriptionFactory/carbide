import type { Root, RootContent } from "mdast";
import type { Plugin } from "unified";

type MdastNode = Record<string, unknown> & { type: string };

const TABLE_META_RE = /^<!--\s*carbide:table\s+(.*?)\s*-->$/;

export type TableMeta = { layout?: "fixed" | "auto" };

export function parse_table_meta(value: string): TableMeta | null {
  const match = TABLE_META_RE.exec(value.trim());
  if (!match) return null;
  const meta: TableMeta = {};
  for (const pair of (match[1] ?? "").split(/\s+/)) {
    const [key, val] = pair.split("=");
    if (key === "layout" && (val === "fixed" || val === "auto")) {
      meta.layout = val;
    }
  }
  return meta;
}

export function format_table_meta_comment(layout: string): string {
  return `<!-- carbide:table layout=${layout} -->`;
}

const CONTAINER_TYPES = new Set([
  "blockquote",
  "list",
  "listItem",
  "callout",
  "calloutBody",
  "details",
  "detailsContent",
]);

function transform_children(children: MdastNode[]): MdastNode[] {
  const out: MdastNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const node = children[i]!;
    if (node.type === "html") {
      const meta = parse_table_meta((node.value as string) || "");
      if (meta) {
        const next = children[i + 1];
        if (next && next.type === "table" && meta.layout) {
          next.data = { ...(next.data as object), layout: meta.layout };
        }
        continue;
      }
    }
    if (CONTAINER_TYPES.has(node.type) && Array.isArray(node.children)) {
      node.children = transform_children(node.children as MdastNode[]);
    }
    out.push(node);
  }
  return out;
}

export const remark_table_meta: Plugin<[], Root> = () => {
  return (tree: Root) => {
    tree.children = transform_children(
      tree.children as unknown as MdastNode[],
    ) as unknown as RootContent[];
  };
};
