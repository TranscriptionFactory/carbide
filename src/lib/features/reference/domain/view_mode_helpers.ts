import type { LinkedNoteInfo } from "../types";

export type TreeNode = {
  name: string;
  path: string;
  children?: TreeNode[];
  note?: LinkedNoteInfo;
};

export function group_by_source(
  notes: LinkedNoteInfo[],
): Map<string, LinkedNoteInfo[]> {
  const groups = new Map<string, LinkedNoteInfo[]>();
  for (const note of notes) {
    const key = note.linked_source_id ?? "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(note);
  }
  return groups;
}

export function build_tree(notes: LinkedNoteInfo[]): TreeNode[] {
  const roots: TreeNode[] = [];

  for (const note of notes) {
    const rel_path = note.vault_relative_path ?? note.path;
    const parts = rel_path.split("/").filter((p) => p.length > 0);
    insert_into_tree(roots, parts, note);
  }

  return roots;
}

function insert_into_tree(
  nodes: TreeNode[],
  parts: string[],
  note: LinkedNoteInfo,
): void {
  if (parts.length === 0) return;

  const head = parts[0] as string;
  const rest = parts.slice(1);

  if (rest.length === 0) {
    nodes.push({ name: head, path: note.path, note });
    return;
  }

  let dir = nodes.find((n) => n.name === head && !n.note);
  if (!dir) {
    const new_dir: TreeNode = {
      name: head,
      path: head as string,
      children: [],
    };
    nodes.push(new_dir);
    dir = new_dir;
  }
  if (!dir.children) dir.children = [];
  insert_into_tree(dir.children, rest, note);
}
