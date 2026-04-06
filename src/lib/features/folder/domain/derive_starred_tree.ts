import type { NoteMeta } from "$lib/shared/types/note";
import type {
  FlatTreeNode,
  FolderLoadState,
  FolderPaginationState,
} from "$lib/shared/types/filetree";
import type { FileTreeNode } from "$lib/features/folder/domain/filetree";
import { as_note_path } from "$lib/shared/types/ids";

function starred_node_id(root_path: string, relative_path: string): string {
  return `starred:${root_path}:${relative_path}`;
}

function is_note_path(path: string): boolean {
  return path.endsWith(".md");
}

function fallback_note_meta(path: string): NoteMeta {
  const name = (path.split("/").at(-1) ?? path).replace(/\.md$/i, "");
  return {
    id: as_note_path(path),
    path: as_note_path(path),
    name,
    title: name,
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function find_tree_node(root: FileTreeNode, path: string): FileTreeNode | null {
  if (!path) return root;
  let current: FileTreeNode | undefined = root;
  for (const segment of path.split("/").filter(Boolean)) {
    current = current?.children.get(segment);
    if (!current) return null;
  }
  return current;
}

type Input = {
  tree: FileTreeNode;
  starred_paths: string[];
  expanded_node_ids: Set<string>;
  load_states: Map<string, FolderLoadState>;
  error_messages: Map<string, string>;
  show_hidden_files: boolean;
  pagination: Map<string, FolderPaginationState>;
};

export function derive_starred_tree(input: Input): FlatTreeNode[] {
  const result: FlatTreeNode[] = [];
  const root_paths = [...input.starred_paths].sort((a, b) => {
    const a_is_folder = !is_note_path(a);
    const b_is_folder = !is_note_path(b);
    if (a_is_folder !== b_is_folder) {
      return a_is_folder ? -1 : 1;
    }
    return a.localeCompare(b);
  });

  for (const root_path of root_paths) {
    if (is_note_path(root_path)) {
      const note_node = find_tree_node(input.tree, root_path);
      const note_meta = note_node?.note ?? fallback_note_meta(root_path);
      result.push({
        id: `starred:${root_path}`,
        path: root_path,
        name: note_meta.name,
        depth: 0,
        is_folder: false,
        is_expanded: false,
        is_loading: false,
        has_error: false,
        error_message: null,
        note: note_meta,
        file_meta: note_node?.file_meta ?? null,
        parent_path: null,
        is_load_more: false,
      });
      continue;
    }

    const root_id = starred_node_id(root_path, "");
    const root_load_state = input.load_states.get(root_path) ?? "unloaded";
    const root_is_expanded = input.expanded_node_ids.has(root_id);
    const root_node = find_tree_node(input.tree, root_path);

    result.push({
      id: root_id,
      path: root_path,
      name: root_path.split("/").at(-1) ?? root_path,
      depth: 0,
      is_folder: true,
      is_expanded: root_is_expanded,
      is_loading: root_load_state === "loading",
      has_error: root_load_state === "error",
      error_message: input.error_messages.get(root_path) ?? null,
      note: null,
      file_meta: null,
      parent_path: null,
      is_load_more: false,
    });

    if (!root_is_expanded || !root_node) {
      continue;
    }

    visit_tree({
      node: root_node,
      root_path,
      depth: 1,
      parent_path: root_path,
      result,
      expanded_node_ids: input.expanded_node_ids,
      load_states: input.load_states,
      error_messages: input.error_messages,
      show_hidden_files: input.show_hidden_files,
      pagination: input.pagination,
    });
  }

  return result;
}

function visit_tree(input: {
  node: FileTreeNode;
  root_path: string;
  depth: number;
  parent_path: string | null;
  result: FlatTreeNode[];
  expanded_node_ids: Set<string>;
  load_states: Map<string, FolderLoadState>;
  error_messages: Map<string, string>;
  show_hidden_files: boolean;
  pagination: Map<string, FolderPaginationState>;
}) {
  for (const [, child] of input.node.children) {
    if (!input.show_hidden_files && child.name.startsWith(".")) {
      continue;
    }

    const relative_path = child.path.slice(input.root_path.length + 1);
    const actual_path = child.path;
    const node_id = starred_node_id(input.root_path, relative_path);
    const load_state = input.load_states.get(actual_path) ?? "unloaded";
    const is_expanded = child.is_folder && input.expanded_node_ids.has(node_id);

    input.result.push({
      id: node_id,
      path: actual_path,
      name: child.name,
      depth: input.depth,
      is_folder: child.is_folder,
      is_expanded,
      is_loading: load_state === "loading",
      has_error: load_state === "error",
      error_message: input.error_messages.get(actual_path) ?? null,
      note: child.note,
      file_meta: child.file_meta,
      parent_path: input.parent_path,
      is_load_more: false,
    });

    if (child.is_folder && is_expanded) {
      visit_tree({
        ...input,
        node: child,
        depth: input.depth + 1,
        parent_path: actual_path,
      });
    }
  }

  const pagination_state = input.pagination.get(input.node.path);
  if (
    pagination_state &&
    pagination_state.loaded_count < pagination_state.total_count
  ) {
    const relative_parent =
      input.node.path === input.root_path
        ? "root"
        : input.node.path.slice(input.root_path.length + 1);
    const load_more_id = starred_node_id(
      input.root_path,
      `__load_more__:${relative_parent}`,
    );

    input.result.push({
      id: load_more_id,
      path: load_more_id,
      name: "",
      depth: input.depth,
      is_folder: false,
      is_expanded: false,
      is_loading: pagination_state.load_state === "loading",
      has_error: pagination_state.load_state === "error",
      error_message: pagination_state.error_message,
      note: null,
      file_meta: null,
      parent_path: input.parent_path,
      is_load_more: true,
    });
  }
}
