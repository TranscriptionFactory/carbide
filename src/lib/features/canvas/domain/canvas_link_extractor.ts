import type { CanvasData } from "$lib/features/canvas/types/canvas";

export type CanvasLinks = {
  file_refs: string[];
  wiki_links: string[];
};

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

export function extract_canvas_links(data: CanvasData): CanvasLinks {
  const file_refs: string[] = [];
  const wiki_links: string[] = [];

  for (const node of data.nodes) {
    if (node.type === "file") {
      file_refs.push(node.file);
    }
    if (node.type === "text") {
      let match: RegExpExecArray | null;
      WIKI_LINK_RE.lastIndex = 0;
      while ((match = WIKI_LINK_RE.exec(node.text)) !== null) {
        const content = match[1]!;
        const target = content.split("|")[0]!.split("#")[0]!.trim();
        if (target) wiki_links.push(target);
      }
    }
  }

  return {
    file_refs: [...new Set(file_refs)].sort(),
    wiki_links: [...new Set(wiki_links)].sort(),
  };
}

export function rewrite_canvas_file_refs(
  data: CanvasData,
  old_path: string,
  new_path: string,
): { data: CanvasData; changed: boolean } {
  let changed = false;
  const old_name = old_path.split("/").pop()?.replace(/\.md$/, "") ?? old_path;
  const new_name = new_path.split("/").pop()?.replace(/\.md$/, "") ?? new_path;

  const nodes = data.nodes.map((node) => {
    if (node.type === "file" && node.file === old_path) {
      changed = true;
      return { ...node, file: new_path };
    }
    if (node.type === "text") {
      const old_link = `[[${old_name}]]`;
      const new_link = `[[${new_name}]]`;
      if (node.text.includes(old_link)) {
        changed = true;
        return { ...node, text: node.text.replaceAll(old_link, new_link) };
      }
    }
    return node;
  });

  return {
    data: { ...data, nodes },
    changed,
  };
}
