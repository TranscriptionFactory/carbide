import type { TagInfo, TagTreeNode } from "../types";

export function build_tag_tree(tags: TagInfo[]): TagTreeNode[] {
  const root_children: TagTreeNode[] = [];
  const node_map = new Map<string, TagTreeNode>();

  for (const { tag, count } of tags) {
    const segments = tag.split("/");
    let current_path = "";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const parent_path = current_path;
      current_path = current_path ? `${current_path}/${segment}` : segment;

      if (!node_map.has(current_path)) {
        const node: TagTreeNode = {
          segment,
          full_tag: current_path,
          own_count: 0,
          descendant_count: 0,
          children: [],
        };
        node_map.set(current_path, node);

        if (parent_path) {
          node_map.get(parent_path)!.children.push(node);
        } else {
          root_children.push(node);
        }
      }

      const node = node_map.get(current_path)!;
      if (i === segments.length - 1) {
        node.own_count += count;
      }
    }
  }

  propagate_descendant_counts(root_children);
  sort_tree(root_children);

  return root_children;
}

function propagate_descendant_counts(nodes: TagTreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    const child_total = propagate_descendant_counts(node.children);
    node.descendant_count = child_total;
    total += node.own_count + child_total;
  }
  return total;
}

function sort_tree(nodes: TagTreeNode[]) {
  nodes.sort(
    (a, b) =>
      b.own_count + b.descendant_count - (a.own_count + a.descendant_count) ||
      a.segment.localeCompare(b.segment),
  );
  for (const node of nodes) {
    sort_tree(node.children);
  }
}

export function filter_tag_tree(
  nodes: TagTreeNode[],
  query: string,
): TagTreeNode[] {
  const q = query.toLowerCase();
  return filter_nodes(nodes, q);
}

function filter_nodes(nodes: TagTreeNode[], query: string): TagTreeNode[] {
  const result: TagTreeNode[] = [];
  for (const node of nodes) {
    const children = filter_nodes(node.children, query);
    if (node.full_tag.toLowerCase().includes(query) || children.length > 0) {
      result.push({ ...node, children });
    }
  }
  return result;
}
