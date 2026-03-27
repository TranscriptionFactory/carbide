import type { Root } from "mdast";
import type { Node as PmNode } from "prosemirror-model";
import { schema } from "./schema";
import {
  parse_processor,
  stringify_processor,
} from "./remark_plugins/remark_processor";
import { mdast_to_pm } from "./mdast_to_pm";
import { pm_to_mdast } from "./pm_to_mdast";

export function parse_to_mdast(markdown: string): Root {
  return parse_processor.runSync(parse_processor.parse(markdown)) as Root;
}

export function parse_markdown(markdown: string): PmNode {
  const tree = parse_to_mdast(markdown);
  return mdast_to_pm(tree);
}

export function serialize_markdown(doc: PmNode): string {
  const tree = pm_to_mdast(doc);
  return stringify_processor.stringify(tree) as string;
}

export { schema };
export { pm_to_mdast };
