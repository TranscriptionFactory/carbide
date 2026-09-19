import { fuzzy_score } from "$lib/shared/utils/fuzzy_score";
import type { VaultProperty } from "../types";

export type PropertyComboItem = {
  value: string;
  hint?: string;
  description?: string | null;
  indices?: number[];
};

export function property_items_for(
  query: string,
  props: VaultProperty[],
): PropertyComboItem[] {
  const q = query.trim();
  const seen = new Set<string>();
  const items: PropertyComboItem[] = [];
  for (const p of props) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    items.push({
      value: p.name,
      hint: p.property_type,
      description:
        p.count > 0
          ? `used in ${String(p.count)} ${p.count === 1 ? "note" : "notes"}`
          : null,
      indices: [],
    });
  }

  if (!q) return items;

  const scored: { item: PropertyComboItem; score: number }[] = [];
  for (const item of items) {
    const match = fuzzy_score(q, item.value);
    if (match) {
      item.indices = match.indices;
      scored.push({ item, score: match.score });
    }
  }
  scored.sort(
    (a, b) => b.score - a.score || a.item.value.localeCompare(b.item.value),
  );
  return scored.map((s) => s.item);
}

export function value_items_for(
  query: string,
  values: string[],
): PropertyComboItem[] {
  const q = query.trim();
  if (!q) return values.map((value) => ({ value, indices: [] }));

  const scored: { value: string; score: number; indices: number[] }[] = [];
  for (const value of values) {
    const match = fuzzy_score(q, value);
    if (match) {
      scored.push({ value, score: match.score, indices: match.indices });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value));
  return scored.map(({ value, indices }) => ({ value, indices }));
}
