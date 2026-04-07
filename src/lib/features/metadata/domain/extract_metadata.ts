import { parse_to_mdast } from "$lib/features/editor";
import { visit } from "unist-util-visit";
import { parse as parse_yaml } from "yaml";
import type { NoteMetadata, NoteProperty, NoteTag } from "../types";
import { infer_property_type } from "./infer_property_type";

const INLINE_TAG_RE = /(?:^|\s)#([a-zA-Z][\w/-]*)/g;

export function extract_metadata(markdown: string): NoteMetadata {
  const tree = parse_to_mdast(markdown);
  const properties: NoteProperty[] = [];
  const tags: NoteTag[] = [];
  const seen_tags = new Set<string>();

  visit(tree, "yaml", (node: { value: string }) => {
    let data: unknown;
    try {
      data = parse_yaml(node.value);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;

    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      if (key === "tags" && Array.isArray(value)) {
        for (const tag of value) {
          const t = String(tag).replace(/^#/, "");
          if (!seen_tags.has(t)) {
            seen_tags.add(t);
            tags.push({ tag: t, source: "frontmatter" });
          }
        }
      } else {
        const type = infer_property_type(value);
        properties.push({
          key,
          value: typeof value === "string" ? value : JSON.stringify(value),
          type,
        });
      }
    }
  });

  visit(tree, "text", (node: { value: string }) => {
    for (const match of node.value.matchAll(INLINE_TAG_RE)) {
      const tag = match[1];
      if (tag && !seen_tags.has(tag)) {
        seen_tags.add(tag);
        tags.push({ tag, source: "inline" });
      }
    }
  });

  return { properties, tags };
}
