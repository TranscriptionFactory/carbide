import type { Root } from "mdast";
import type { Node as PmNode, Mark } from "prosemirror-model";
import { schema } from "./schema";

type AnyMdastNode = Record<string, unknown> & { type: string };

function flatten_inline(
  nodes: AnyMdastNode[],
  marks: Mark[],
  result: PmNode[],
): void {
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        const val = node.value as string;
        if (val) result.push(schema.text(val, marks.length > 0 ? marks : null));
        break;
      }
      case "emphasis":
        flatten_inline(
          (node.children as AnyMdastNode[]) || [],
          [...marks, schema.marks.em.create()],
          result,
        );
        break;
      case "strong":
        flatten_inline(
          (node.children as AnyMdastNode[]) || [],
          [...marks, schema.marks.strong.create()],
          result,
        );
        break;
      case "delete":
        flatten_inline(
          (node.children as AnyMdastNode[]) || [],
          [...marks, schema.marks.strikethrough.create()],
          result,
        );
        break;
      case "link":
        flatten_inline(
          (node.children as AnyMdastNode[]) || [],
          [
            ...marks,
            schema.marks.link.create({
              href: (node.url as string) || "",
              title: (node.title as string | null) || null,
              link_source: "markdown",
            }),
          ],
          result,
        );
        break;
      case "inlineCode":
        result.push(
          schema.text(node.value as string, [
            ...marks,
            schema.marks.code_inline.create(),
          ]),
        );
        break;
      case "image":
        result.push(
          schema.nodes.image.create({
            src: (node.url as string) || "",
            alt: (node.alt as string) || "",
            title: (node.title as string) || "",
          }),
        );
        break;
      case "break":
        result.push(schema.nodes.hardbreak.create());
        break;
      case "inlineMath": {
        const val = node.value as string;
        result.push(
          schema.nodes.math_inline.create(
            null,
            val ? schema.text(val) : undefined,
          ),
        );
        break;
      }
      case "highlight":
        flatten_inline(
          (node.children as AnyMdastNode[]) || [],
          [...marks, schema.marks.highlight.create()],
          result,
        );
        break;
      case "html": {
        const html_val = (node.value as string) || "";
        const text_match = html_val.replace(/<[^>]*>/g, "");
        if (text_match)
          result.push(schema.text(text_match, marks.length > 0 ? marks : null));
        break;
      }
      default:
        break;
    }
  }
}

function convert_inline(parent: AnyMdastNode): PmNode[] {
  const result: PmNode[] = [];
  flatten_inline((parent.children as AnyMdastNode[]) || [], [], result);
  return result;
}

function convert_block(node: AnyMdastNode): PmNode | null {
  switch (node.type) {
    case "paragraph": {
      const inline = convert_inline(node);
      if (inline.length === 0) {
        return schema.nodes.paragraph.create();
      }
      return schema.nodes.paragraph.create(null, inline);
    }

    case "heading": {
      const inline = convert_inline(node);
      return schema.nodes.heading.create(
        { level: (node.depth as number) || 1 },
        inline.length > 0 ? inline : undefined,
      );
    }

    case "blockquote": {
      const children = convert_blocks(node.children as AnyMdastNode[]);
      return schema.nodes.blockquote.create(null, children);
    }

    case "code": {
      const lang = (node.lang as string) || "";
      const val = (node.value as string) || "";
      return schema.nodes.code_block.create(
        { language: lang },
        val ? schema.text(val) : undefined,
      );
    }

    case "thematicBreak":
      return schema.nodes.hr.create();

    case "list": {
      const items = (node.children as AnyMdastNode[]).map(convert_list_item);
      if (node.ordered) {
        return schema.nodes.ordered_list.create(
          { order: (node.start as number) || 1 },
          items,
        );
      }
      return schema.nodes.bullet_list.create(null, items);
    }

    case "table": {
      return convert_table(node);
    }

    case "yaml": {
      const val = (node.value as string) || "";
      return schema.nodes.frontmatter.create(
        null,
        val ? schema.text(val) : undefined,
      );
    }

    case "math": {
      const val = (node.value as string) || "";
      return schema.nodes.math_block.create({ value: val });
    }

    case "details": {
      return convert_details(node);
    }

    case "callout": {
      return convert_callout(node);
    }

    case "html": {
      return null;
    }

    default:
      return null;
  }
}

function convert_list_item(node: AnyMdastNode): PmNode {
  const checked =
    node.checked !== undefined && node.checked !== null
      ? (node.checked as boolean)
      : null;

  const children_nodes = node.children as AnyMdastNode[];

  let pm_children: PmNode[] = [];

  if (children_nodes.length === 0) {
    pm_children = [schema.nodes.paragraph.create()];
  } else {
    const first = children_nodes[0];
    if (!first) {
      pm_children = [schema.nodes.paragraph.create()];
    } else if (first.type === "paragraph") {
      const first_pm = convert_block(first);
      if (first_pm) pm_children.push(first_pm);
      for (let i = 1; i < children_nodes.length; i++) {
        const child_node = children_nodes[i];
        if (child_node) {
          const child = convert_block(child_node);
          if (child) pm_children.push(child);
        }
      }
    } else {
      const inline = convert_inline(first);
      pm_children.push(
        schema.nodes.paragraph.create(
          null,
          inline.length > 0 ? inline : undefined,
        ),
      );
      for (let i = 1; i < children_nodes.length; i++) {
        const child_node = children_nodes[i];
        if (child_node) {
          const child = convert_block(child_node);
          if (child) pm_children.push(child);
        }
      }
    }
  }

  if (pm_children.length === 0) {
    pm_children = [schema.nodes.paragraph.create()];
  }

  return schema.nodes.list_item.create({ checked }, pm_children);
}

function convert_table(node: AnyMdastNode): PmNode {
  const rows = node.children as AnyMdastNode[];
  const align = (node.align as Array<string | null>) || [];
  const pm_rows: PmNode[] = [];

  rows.forEach((row, row_index) => {
    const cells = row.children as AnyMdastNode[];
    const pm_cells: PmNode[] = [];

    cells.forEach((cell, col_index) => {
      const col_align = align[col_index] || null;
      const cell_inline = convert_inline(cell);
      const cell_para = schema.nodes.paragraph.create(
        null,
        cell_inline.length > 0 ? cell_inline : undefined,
      );

      if (row_index === 0) {
        pm_cells.push(
          schema.nodes.table_header.create({ alignment: col_align || "left" }, [
            cell_para,
          ]),
        );
      } else {
        pm_cells.push(
          schema.nodes.table_cell.create({ alignment: col_align || "left" }, [
            cell_para,
          ]),
        );
      }
    });

    pm_rows.push(schema.nodes.table_row.create(null, pm_cells));
  });

  return schema.nodes.table.create(null, pm_rows);
}

function convert_details(node: AnyMdastNode): PmNode {
  const open = (node.data as { open?: boolean })?.open || false;
  const children = node.children as AnyMdastNode[];

  const summary_node = children[0];
  const content_node = children[1];

  const summary_inline = summary_node ? convert_inline(summary_node) : [];
  const pm_summary = schema.nodes.details_summary.create(
    null,
    summary_inline.length > 0 ? summary_inline : undefined,
  );

  let content_children: PmNode[] = [];
  if (content_node) {
    content_children = convert_blocks(content_node.children as AnyMdastNode[]);
  }
  if (content_children.length === 0) {
    content_children = [schema.nodes.paragraph.create()];
  }

  const pm_content = schema.nodes.details_content.create(
    null,
    content_children,
  );

  return schema.nodes.details_block.create({ open }, [pm_summary, pm_content]);
}

function convert_callout(node: AnyMdastNode): PmNode {
  const data =
    (node.data as {
      callout_type?: string;
      title?: string;
      foldable?: boolean;
      default_folded?: boolean;
    }) ?? {};
  const children = node.children as AnyMdastNode[];

  const title_node = children[0];
  const body_node = children[1];

  const title_inline = title_node ? convert_inline(title_node) : [];
  const pm_title = schema.nodes.callout_title.create(
    null,
    title_inline.length > 0 ? title_inline : undefined,
  );

  let body_children: PmNode[] = [];
  if (body_node) {
    body_children = convert_blocks(body_node.children as AnyMdastNode[]);
  }
  if (body_children.length === 0) {
    body_children = [schema.nodes.paragraph.create()];
  }

  const pm_body = schema.nodes.callout_body.create(null, body_children);

  return schema.nodes.callout.create(
    {
      callout_type: data.callout_type || "note",
      foldable: data.foldable ?? false,
      default_folded: data.default_folded ?? false,
    },
    [pm_title, pm_body],
  );
}

function convert_blocks(nodes: AnyMdastNode[]): PmNode[] {
  const result: PmNode[] = [];
  for (const node of nodes) {
    const pm = convert_block(node);
    if (pm) result.push(pm);
  }
  return result;
}

export function mdast_to_pm(tree: Root): PmNode {
  const children = tree.children as unknown as AnyMdastNode[];
  const pm_children = convert_blocks(children);

  const has_frontmatter =
    pm_children.length > 0 && pm_children[0]?.type.name === "frontmatter";
  const has_body = pm_children.length > (has_frontmatter ? 1 : 0);

  if (has_frontmatter && !has_body) {
    pm_children.push(schema.nodes.paragraph.create());
  }

  if (pm_children.length === 0) {
    pm_children.push(schema.nodes.paragraph.create());
  }

  return schema.nodes.doc.create(null, pm_children);
}
