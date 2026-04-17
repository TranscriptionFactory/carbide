import type { Root } from "mdast";
import type { Node as PmNode } from "prosemirror-model";
import { schema } from "./schema";
import {
  parse_processor,
  fallback_parse_processor,
  stringify_processor,
} from "./remark_plugins/remark_processor";
import { mdast_to_pm } from "./mdast_to_pm";
import { pm_to_mdast } from "./pm_to_mdast";

export function parse_to_mdast(markdown: string): Root {
  return parse_processor.runSync(parse_processor.parse(markdown)) as Root;
}

function create_empty_doc(): PmNode {
  const paragraph = schema.nodes["paragraph"]?.create();
  return schema.nodes["doc"]!.create(null, paragraph ? [paragraph] : []);
}

export function parse_markdown(markdown: string): PmNode {
  try {
    const tree = parse_to_mdast(markdown);
    return mdast_to_pm(tree);
  } catch (err) {
    console.warn(
      "[markdown_pipeline] Primary parse failed, trying fallback with reduced plugins:",
      err,
    );
    try {
      const tree = fallback_parse_processor.runSync(
        fallback_parse_processor.parse(markdown),
      ) as Root;
      return mdast_to_pm(tree);
    } catch (fallback_err) {
      console.warn(
        "[markdown_pipeline] Fallback parse also failed, returning empty document:",
        fallback_err,
      );
      return create_empty_doc();
    }
  }
}

export function serialize_markdown(doc: PmNode): string {
  const tree = pm_to_mdast(doc);
  return stringify_processor.stringify(tree) as string;
}

export { schema };
export { pm_to_mdast };
