import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

const MAX_CANVAS_CHARS = 4000;

const sanitize_schema = {
  ...defaultSchema,
  tagNames: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "ul",
    "ol",
    "li",
    "code",
    "pre",
    "blockquote",
    "strong",
    "em",
    "a",
    "br",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "del",
    "input",
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: ["href"],
    input: ["type", "checked", "disabled"],
    th: ["align"],
    td: ["align"],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, sanitize_schema)
  .use(rehypeStringify);

const parse_processor = unified().use(remarkParse).use(remarkGfm);

export function render_markdown_to_html(md: string): string {
  return String(processor.processSync(md));
}

export function extract_subpath_section(md: string, subpath: string): string {
  if (!subpath.startsWith("#")) return md;
  const heading_text = subpath.slice(1).replace(/-/g, " ").toLowerCase();

  const tree = parse_processor.parse(md);
  const children = tree.children;

  let start_index = -1;
  let start_depth = 0;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (!node || node.type !== "heading") continue;
    const text = extract_text(node).toLowerCase();
    if (text === heading_text) {
      start_index = i;
      start_depth = node.depth;
      break;
    }
  }

  if (start_index === -1) return md;

  let end_index = children.length;
  for (let i = start_index + 1; i < children.length; i++) {
    const node = children[i];
    if (node && node.type === "heading" && node.depth <= start_depth) {
      end_index = i;
      break;
    }
  }

  const section_nodes = children.slice(start_index, end_index);
  const positions = section_nodes
    .filter((n) => n.position != null)
    .map((n) => n.position as NonNullable<typeof n.position>);
  if (positions.length === 0) return md;

  const first_pos = positions[0];
  const last_pos = positions[positions.length - 1];
  if (!first_pos || !last_pos) return md;

  const start_offset = first_pos.start.offset ?? 0;
  const end_offset = last_pos.end.offset ?? md.length;

  return md.slice(start_offset, end_offset);
}

function extract_text(node: { children?: unknown[] }): string {
  if (!node.children) return "";
  return (
    node.children as Array<{
      type: string;
      value?: string;
      children?: unknown[];
    }>
  )
    .map((c) => (c.type === "text" ? (c.value ?? "") : extract_text(c)))
    .join("");
}

export function truncate_for_canvas(
  md: string,
  max_chars: number = MAX_CANVAS_CHARS,
): string {
  if (md.length <= max_chars) return md;
  const truncated = md.slice(0, max_chars);
  const last_newline = truncated.lastIndexOf("\n");
  return (
    (last_newline > max_chars * 0.5
      ? truncated.slice(0, last_newline)
      : truncated) + "\n\n…"
  );
}
