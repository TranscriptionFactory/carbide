import type { BaseNoteRow } from "../ports";

export type KanbanColumn = {
  value: string;
  rows: BaseNoteRow[];
};

const UNSET_COLUMN = "(unset)";

export function group_rows_by_property(
  rows: BaseNoteRow[],
  property: string,
  column_order?: string[],
): KanbanColumn[] {
  const groups = new Map<string, BaseNoteRow[]>();

  for (const row of rows) {
    const raw = row.properties[property]?.value;
    const key = raw?.trim() || UNSET_COLUMN;
    const list = groups.get(key);
    if (list) {
      list.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  if (column_order && column_order.length > 0) {
    const result: KanbanColumn[] = [];
    const seen = new Set<string>();

    for (const value of column_order) {
      seen.add(value);
      result.push({ value, rows: groups.get(value) ?? [] });
    }

    for (const [value, group_rows] of groups) {
      if (!seen.has(value)) {
        result.push({ value, rows: group_rows });
      }
    }

    return result;
  }

  const sorted_keys = Array.from(groups.keys()).sort((a, b) => {
    if (a === UNSET_COLUMN) return 1;
    if (b === UNSET_COLUMN) return -1;
    return a.localeCompare(b);
  });

  return sorted_keys.map((value) => ({
    value,
    rows: groups.get(value)!,
  }));
}
