import type { NoteMeta } from "$lib/shared/types/note";
import type { FileMeta } from "$lib/shared/types/filetree";
import {
  build_filetree,
  folder_note_of,
  sort_tree,
  type FileTreeNode,
} from "$lib/features/folder/domain/filetree";

export type DrillDownEntry = {
  path: string;
  name: string;
  is_folder: boolean;
  note: NoteMeta | null;
  folder_note: NoteMeta | null;
  file_meta: FileMeta | null;
};

export type DrillDownListing = {
  current_path: string;
  parent_path: string | null;
  entries: DrillDownEntry[];
};

export function parent_path_of(path: string): string | null {
  if (!path) return null;
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

function find_folder(root: FileTreeNode, path: string): FileTreeNode | null {
  if (!path) return root;
  const parts = path.split("/").filter(Boolean);
  let current = root;
  for (const part of parts) {
    const next = current.children.get(part);
    if (!next || !next.is_folder) return null;
    current = next;
  }
  return current;
}

export function list_folder(
  notes: NoteMeta[],
  folder_paths: string[],
  files: FileMeta[],
  current_path: string,
  show_hidden_files: boolean,
): DrillDownListing {
  const tree = sort_tree(build_filetree(notes, folder_paths, files));
  const node = find_folder(tree, current_path);
  const entries: DrillDownEntry[] = [];

  if (node) {
    for (const [, child] of node.children) {
      if (!show_hidden_files && child.name.startsWith(".")) continue;
      entries.push({
        path: child.path,
        name: child.name,
        is_folder: child.is_folder,
        note: child.note,
        folder_note: folder_note_of(child),
        file_meta: child.file_meta,
      });
    }
  }

  return {
    current_path,
    parent_path: parent_path_of(current_path),
    entries,
  };
}
