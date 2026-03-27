import { parse_to_mdast } from "$lib/features/editor";
import { visit } from "unist-util-visit";
import type { ExternalLink } from "../types/link";

type LocalLinksResult = {
  outlink_paths: string[];
  external_links: ExternalLink[];
};

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function is_external_url(url: string): boolean {
  return /^https?:\/\//i.test(url) || /^mailto:/i.test(url);
}

function collect_text(children: unknown[]): string {
  let result = "";
  for (const child of children) {
    const node = child as {
      type: string;
      value?: string;
      children?: unknown[];
    };
    if (node.type === "text" && node.value) result += node.value;
    else if (node.children) result += collect_text(node.children);
  }
  return result;
}

export function extract_local_links(markdown: string): LocalLinksResult {
  const tree = parse_to_mdast(markdown);
  const outlink_set = new Set<string>();
  const external_links: ExternalLink[] = [];
  const seen_urls = new Set<string>();

  visit(tree, "link", (node: { url: string; children: unknown[] }) => {
    const url = node.url;
    if (!url) return;

    if (is_external_url(url)) {
      if (!seen_urls.has(url)) {
        seen_urls.add(url);
        external_links.push({ url, text: collect_text(node.children) });
      }
    } else {
      const path = url.split("#")[0];
      if (path) outlink_set.add(path);
    }
  });

  for (const match of markdown.matchAll(WIKI_LINK_RE)) {
    const target = match[1]?.trim();
    if (target) {
      const path = target.split("#")[0];
      if (path) outlink_set.add(path);
    }
  }

  return {
    outlink_paths: [...outlink_set],
    external_links,
  };
}
