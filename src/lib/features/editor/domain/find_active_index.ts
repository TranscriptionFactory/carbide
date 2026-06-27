import type { FindMatchRange } from "./find_types";

export function normalize_active_index(
  active_index: number,
  total: number,
): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(active_index)) return 0;
  return Math.min(Math.max(Math.trunc(active_index), 0), total - 1);
}

export function next_active_index_after_replacement(
  matches: readonly FindMatchRange[],
  replaced_from: number,
  replacement_length: number,
): number {
  if (matches.length === 0) return 0;
  const replacement_end = replaced_from + replacement_length;
  const next_index = matches.findIndex(
    (match) => match.from >= replacement_end,
  );
  return next_index === -1 ? 0 : next_index;
}
