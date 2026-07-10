import { parse_to_mdast } from "$lib/features/editor";
import { visit } from "unist-util-visit";

const WIKI_EMBED_RE = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

const IMAGE_EXT_RE = /\.(png|jpg|jpeg|gif|webp)$/i;

function is_external_url(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
}

export function extract_note_image_targets(markdown: string): string[] {
  const targets = new Set<string>();

  const tree = parse_to_mdast(markdown);
  visit(tree, "image", (node: { url?: string }) => {
    const url = node.url;
    if (url && !is_external_url(url) && IMAGE_EXT_RE.test(url)) {
      targets.add(url);
    }
  });

  for (const match of markdown.matchAll(WIKI_EMBED_RE)) {
    const target = match[1]?.trim();
    if (target && !is_external_url(target) && IMAGE_EXT_RE.test(target)) {
      targets.add(target);
    }
  }

  return [...targets];
}
