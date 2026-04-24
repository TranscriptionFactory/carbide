import type { Node as PmNode, Mark } from "prosemirror-model";
import type { Root, RootContent, PhrasingContent } from "mdast";

type MdastNode = Record<string, unknown> & { type: string };

interface InlineTextItem {
  kind: "text";
  value: string;
  marks: readonly Mark[];
}

interface InlineNodeItem {
  kind: "node";
  pm_node: PmNode;
  marks: readonly Mark[];
}

type InlineItem = InlineTextItem | InlineNodeItem;

function convert_leaf(item: InlineItem): PhrasingContent {
  if (item.kind === "text") {
    return { type: "text", value: item.value } as PhrasingContent;
  }
  return convert_inline_pm_node(item.pm_node);
}

function convert_inline_pm_node(node: PmNode): PhrasingContent {
  switch (node.type.name) {
    case "hardbreak":
      return { type: "break" } as PhrasingContent;
    case "math_inline":
      return {
        type: "inlineMath",
        value: node.textContent,
      } as unknown as PhrasingContent;
    case "image":
      return {
        type: "image",
        url: (node.attrs["src"] as string) || "",
        alt: (node.attrs["alt"] as string) || "",
        title: (node.attrs["title"] as string) || null,
      } as PhrasingContent;
    default:
      return { type: "text", value: node.textContent } as PhrasingContent;
  }
}

function wrap_in_mdast_mark(
  mark: Mark,
  children: PhrasingContent[],
): PhrasingContent {
  switch (mark.type.name) {
    case "em":
      return { type: "emphasis", children } as PhrasingContent;
    case "strong":
      return { type: "strong", children } as PhrasingContent;
    case "strikethrough":
      return { type: "delete", children } as PhrasingContent;
    case "highlight":
      return { type: "highlight", children } as unknown as PhrasingContent;
    case "link":
      return {
        type: "link",
        url: (mark.attrs["href"] as string) || "",
        title: (mark.attrs["title"] as string | null) || null,
        children,
      } as PhrasingContent;
    case "code_inline": {
      const text_value = children
        .filter((c): c is { type: "text"; value: string } => c.type === "text")
        .map((c) => c.value)
        .join("");
      return { type: "inlineCode", value: text_value } as PhrasingContent;
    }
    default:
      return children[0] ?? ({ type: "text", value: "" } as PhrasingContent);
  }
}

function build_mdast_inline(items: InlineItem[]): PhrasingContent[] {
  if (items.length === 0) return [];
  const result: PhrasingContent[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    if (!item) break;
    if (item.marks.length === 0) {
      result.push(convert_leaf(item));
      i++;
      continue;
    }

    let best_mark: Mark | null = null;
    let best_end = i + 1;

    for (const mark of item.marks) {
      let end = i + 1;
      while (
        end < items.length &&
        (items[end]?.marks.some((m) => m.eq(mark)) ?? false)
      ) {
        end++;
      }
      if (!best_mark || end > best_end) {
        best_mark = mark;
        best_end = end;
      }
    }

    if (!best_mark) {
      result.push(convert_leaf(item));
      i++;
      continue;
    }

    const captured_mark = best_mark;
    const inner: InlineItem[] = items.slice(i, best_end).map((it) => ({
      ...it,
      marks: it.marks.filter((m) => !m.eq(captured_mark)),
    }));

    const children = build_mdast_inline(inner);
    result.push(wrap_in_mdast_mark(captured_mark, children));
    i = best_end;
  }

  return result;
}

function convert_pm_inline(parent: PmNode): PhrasingContent[] {
  const items: InlineItem[] = [];
  parent.forEach((child) => {
    if (child.isText) {
      items.push({ kind: "text", value: child.text || "", marks: child.marks });
    } else {
      items.push({ kind: "node", pm_node: child, marks: child.marks });
    }
  });
  return build_mdast_inline(items);
}

function trim_trailing_phrasing_whitespace(children: PhrasingContent[]): void {
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (child && child.type === "text" && "value" in child) {
      const trimmed = (child as { value: string }).value.replace(/\s+$/, "");
      if (trimmed.length > 0) {
        (child as { value: string }).value = trimmed;
        return;
      }
      children.splice(i, 1);
    } else {
      return;
    }
  }
}

function convert_block_node(node: PmNode): MdastNode | null {
  switch (node.type.name) {
    case "paragraph": {
      const children = convert_pm_inline(node);
      trim_trailing_phrasing_whitespace(children);
      return {
        type: "paragraph",
        children:
          children.length > 0 ? children : [{ type: "text", value: "" }],
      };
    }

    case "heading": {
      const children = convert_pm_inline(node);
      trim_trailing_phrasing_whitespace(children);
      return {
        type: "heading",
        depth: (node.attrs["level"] as number) || 1,
        children,
      };
    }

    case "blockquote": {
      const children = convert_children(node);
      return { type: "blockquote", children };
    }

    case "code_block": {
      return {
        type: "code",
        lang: (node.attrs["language"] as string) || null,
        value: node.textContent,
      };
    }

    case "hr":
      return { type: "thematicBreak" };

    case "bullet_list": {
      const items = convert_list_items(node);
      return { type: "list", ordered: false, spread: false, children: items };
    }

    case "ordered_list": {
      const items = convert_list_items(node);
      return {
        type: "list",
        ordered: true,
        start: (node.attrs["order"] as number) || 1,
        spread: false,
        children: items,
      };
    }

    case "list_item": {
      return convert_list_item(node);
    }

    case "table": {
      return convert_table(node);
    }

    case "frontmatter":
      return { type: "yaml", value: node.textContent };

    case "math_block":
      return {
        type: "math",
        value: (node.attrs["value"] as string) || node.textContent,
      };

    case "details_block": {
      const open = (node.attrs["open"] as boolean) || false;
      const summary = node.child(0);
      const content = node.child(1);
      const summary_inline = convert_pm_inline(summary);
      const content_children = convert_children(content);
      return {
        type: "details",
        data: { open },
        children: [
          { type: "detailsSummary", children: summary_inline },
          { type: "detailsContent", children: content_children },
        ],
      };
    }

    case "details_summary":
    case "details_content":
      return null;

    case "callout": {
      const callout_type = (node.attrs["callout_type"] as string) || "note";
      const foldable = (node.attrs["foldable"] as boolean) || false;
      const default_folded = (node.attrs["default_folded"] as boolean) || false;
      const title = node.child(0);
      const body = node.child(1);
      const title_inline = convert_pm_inline(title);
      const body_children = convert_children(body);
      return {
        type: "callout",
        data: { callout_type, foldable, default_folded },
        children: [
          { type: "calloutTitle", children: title_inline },
          { type: "calloutBody", children: body_children },
        ],
      };
    }

    case "callout_title":
    case "callout_body":
      return null;

    case "excalidraw_embed": {
      const src = (node.attrs["src"] as string) || "";
      return { type: "wikiEmbed", value: `![[${src}]]` };
    }

    case "file_embed": {
      const src = (node.attrs["src"] as string) || "";
      const params: string[] = [];
      if (node.attrs["page"] != null)
        params.push(`page=${String(node.attrs["page"])}`);
      if ((node.attrs["height"] as number) !== 400)
        params.push(`height=${String(node.attrs["height"])}`);
      const fragment = params.length > 0 ? `#${params.join("&")}` : "";
      return { type: "wikiEmbed", value: `![[${src}${fragment}]]` };
    }

    case "image-block":
    case "image": {
      const alt =
        (node.attrs["alt"] as string) ||
        (node.type.name === "image-block"
          ? (node.attrs["caption"] as string) || ""
          : "");
      return {
        type: "image",
        url: (node.attrs["src"] as string) || "",
        alt,
        title: (node.attrs["title"] as string) || null,
      };
    }

    default:
      return null;
  }
}

function convert_list_item(node: PmNode): MdastNode {
  const checked = node.attrs["checked"] as boolean | null;
  const children = convert_children(node);
  return {
    type: "listItem",
    checked: checked !== null ? checked : undefined,
    spread: false,
    children,
  };
}

function convert_list_items(node: PmNode): MdastNode[] {
  const items: MdastNode[] = [];
  node.forEach((child) => {
    const item = convert_list_item(child);
    items.push(item);
  });
  return items;
}

function convert_table(node: PmNode): MdastNode {
  const rows: MdastNode[] = [];
  const align: Array<string | null> = [];

  node.forEach((row_node, _offset, row_index) => {
    const cells: MdastNode[] = [];

    row_node.forEach((cell_node, _off, _col_index) => {
      if (row_index === 0) {
        const cell_align = (cell_node.attrs["alignment"] as string) || "left";
        if (cell_align === "left") {
          align.push(null);
        } else {
          align.push(cell_align);
        }
      }

      const cell_inline = cell_node.firstChild
        ? convert_pm_inline(cell_node.firstChild)
        : [];
      cells.push({
        type: "tableCell",
        children:
          cell_inline.length > 0 ? cell_inline : [{ type: "text", value: "" }],
      });
    });

    rows.push({ type: "tableRow", children: cells });
  });

  return { type: "table", align, children: rows };
}

function convert_children(node: PmNode): MdastNode[] {
  const result: MdastNode[] = [];
  node.forEach((child) => {
    const converted = convert_block_node(child);
    if (converted) result.push(converted);
  });
  return result;
}

export function pm_to_mdast(doc: PmNode): Root {
  const children: MdastNode[] = [];
  doc.forEach((child) => {
    const node = convert_block_node(child);
    if (node) children.push(node);
  });
  const last_pm = doc.lastChild;
  if (
    last_pm &&
    last_pm.type.name === "paragraph" &&
    last_pm.content.size === 0 &&
    children.length > 0
  ) {
    children.pop();
  }
  return { type: "root", children: children as RootContent[] };
}
