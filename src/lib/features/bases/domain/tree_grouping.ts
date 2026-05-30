import type { BaseNoteRow } from "../ports";

export type TreeNode = {
  key: string;
  label: string;
  path: string;
  rows: BaseNoteRow[];
  children: TreeNode[];
};

const UNSET_LABEL = "(unset)";

function format_date_value(
  raw: string,
  date_format: string | undefined,
): string {
  if (!date_format) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const yyyy = String(parsed.getFullYear());
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return date_format
    .replace(/YYYY/g, yyyy)
    .replace(/MM/g, mm)
    .replace(/DD/g, dd);
}

function values_for_property(
  row: BaseNoteRow,
  property: string,
  date_format: string | undefined,
): string[] {
  if (property === "tags" || property === "tag") {
    return row.tags.length > 0 ? row.tags : [UNSET_LABEL];
  }
  const prop = row.properties[property];
  if (!prop) return [UNSET_LABEL];
  const raw = prop.value?.trim();
  if (!raw) return [UNSET_LABEL];
  if (prop.property_type === "date") {
    return [format_date_value(raw, date_format)];
  }
  return [raw];
}

export function group_rows_by_tree(
  rows: BaseNoteRow[],
  group_by: string[],
  date_format?: string,
): TreeNode[] {
  if (group_by.length === 0) return [];

  const root_map = new Map<string, TreeNode>();

  for (const row of rows) {
    insert_row(row, group_by, 0, "", root_map, date_format);
  }

  return sort_nodes(Array.from(root_map.values()));
}

function insert_row(
  row: BaseNoteRow,
  group_by: string[],
  depth: number,
  parent_path: string,
  bucket: Map<string, TreeNode>,
  date_format: string | undefined,
) {
  const property = group_by[depth]!;
  const values = values_for_property(row, property, date_format);

  for (const value of values) {
    const node_path = parent_path ? `${parent_path}/${value}` : value;
    let node = bucket.get(value);
    if (!node) {
      node = {
        key: value,
        label: value,
        path: node_path,
        rows: [],
        children: [],
      };
      bucket.set(value, node);
    }

    if (depth === group_by.length - 1) {
      node.rows.push(row);
    } else {
      const child_bucket = new Map<string, TreeNode>(
        node.children.map((c) => [c.key, c]),
      );
      insert_row(
        row,
        group_by,
        depth + 1,
        node_path,
        child_bucket,
        date_format,
      );
      node.children = Array.from(child_bucket.values());
    }
  }
}

function sort_nodes(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((node) => ({ ...node, children: sort_nodes(node.children) }))
    .sort((a, b) => {
      if (a.key === UNSET_LABEL) return 1;
      if (b.key === UNSET_LABEL) return -1;
      return a.label.localeCompare(b.label);
    });
}
