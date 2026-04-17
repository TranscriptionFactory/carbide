import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import type { Options as StringifyOptions } from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import remarkGemoji from "remark-gemoji";
import { remark_highlight, highlight_to_markdown } from "./remark_highlight";
import { remark_details, details_to_markdown } from "./remark_details";
import { remark_callout, callout_to_markdown } from "./remark_callout";

type StringifyState = {
  enter: (s: string) => () => void;
  containerPhrasing: (n: unknown, i: unknown) => string;
  containerFlow: (n: unknown, i: unknown) => string;
};

type TableNode = {
  align: Array<string | null>;
  children: Array<{ children: Array<{ children: unknown[] }> }>;
};

function table_handler(
  node: TableNode,
  _parent: unknown,
  state: StringifyState,
  info: unknown,
): string {
  const rows = node.children;
  const align = node.align || [];

  const row_strings = rows.map((row) => {
    const cells = row.children.map((cell) => {
      const exit = state.enter("tableCell");
      const val = state.containerPhrasing(cell, info);
      exit();
      return val;
    });
    return `| ${cells.join(" | ")} |`;
  });

  const sep_cells = (rows[0]?.children || []).map((_cell, ci) => {
    const a = align[ci];
    if (a === "center") return ":---:";
    if (a === "right") return "---:";
    if (a === "left") return ":---";
    return "---";
  });
  const sep = `| ${sep_cells.join(" | ")} |`;

  const parts = [row_strings[0] ?? "", sep];
  for (let i = 1; i < row_strings.length; i++) {
    parts.push(row_strings[i] ?? "");
  }
  return parts.join("\n");
}

function wiki_embed_handler(node: { value: string }): string {
  return node.value;
}

const stringify_options: StringifyOptions = {
  bullet: "-",
  emphasis: "*",
  rule: "-",
  listItemIndent: "one",
  handlers: {
    ...highlight_to_markdown,
    ...details_to_markdown,
    ...callout_to_markdown,
    table: table_handler,
    wikiEmbed: wiki_embed_handler,
  } as unknown as StringifyOptions["handlers"],
};

export const parse_processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGemoji)
  .use(remark_highlight)
  .use(remark_details)
  .use(remark_callout);

export const fallback_parse_processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGemoji);

export const stringify_processor = unified()
  .use(remarkStringify, stringify_options)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ["yaml"]);
