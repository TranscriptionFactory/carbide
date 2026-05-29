import type { NoteMeta } from "$lib/shared/types/note";

export const OMNIBAR_SCORES = {
  exact_prefix: 1.0,
  substring: 0.6,
  fuzzy: 0.3,
  recency_boost_per_access: 0.1,
  recency_boost_max: 0.3,
} as const;

export const RECENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AccessHistory = ReadonlyMap<string, readonly number[]>;

export type RankingContext = {
  query: string;
  now_ms: number;
  access_history?: AccessHistory | undefined;
};

export type RankedScore = {
  match_score: number;
  recency_boost: number;
  total: number;
  kind: "exact_prefix" | "substring" | "fuzzy" | "none";
};

function lower(value: string): string {
  return value.toLowerCase();
}

function targets_for(note: NoteMeta): string[] {
  const out: string[] = [];
  if (note.title) out.push(note.title);
  if (note.name && note.name !== note.title) out.push(note.name);
  if (note.path) out.push(note.path);
  return out;
}

function is_fuzzy_subsequence(query: string, target: string): boolean {
  if (query.length === 0) return true;
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti += 1) {
    if (target[ti] === query[qi]) qi += 1;
  }
  return qi === query.length;
}

export function classify_match(
  query: string,
  targets: readonly string[],
): RankedScore["kind"] {
  const q = lower(query.trim());
  if (q === "") return "none";

  let best: RankedScore["kind"] = "none";
  for (const target of targets) {
    const t = lower(target);
    if (t.startsWith(q)) return "exact_prefix";
    if (t.includes(q)) {
      best = "substring";
      continue;
    }
    if (best === "none" && is_fuzzy_subsequence(q, t)) {
      best = "fuzzy";
    }
  }
  return best;
}

function match_score(kind: RankedScore["kind"]): number {
  switch (kind) {
    case "exact_prefix":
      return OMNIBAR_SCORES.exact_prefix;
    case "substring":
      return OMNIBAR_SCORES.substring;
    case "fuzzy":
      return OMNIBAR_SCORES.fuzzy;
    case "none":
      return 0;
  }
}

export function recency_boost(
  note_id: string,
  context: { now_ms: number; access_history?: AccessHistory | undefined },
): number {
  const history = context.access_history?.get(note_id);
  if (!history || history.length === 0) return 0;
  const cutoff = context.now_ms - RECENCY_WINDOW_MS;
  let recent_accesses = 0;
  for (const ts of history) {
    if (ts >= cutoff) recent_accesses += 1;
  }
  const boost = recent_accesses * OMNIBAR_SCORES.recency_boost_per_access;
  return Math.min(boost, OMNIBAR_SCORES.recency_boost_max);
}

export function score_note(
  note: NoteMeta,
  context: RankingContext,
): RankedScore {
  const kind = classify_match(context.query, targets_for(note));
  const ms = match_score(kind);
  const rb = kind === "none" ? 0 : recency_boost(note.id, context);
  return { match_score: ms, recency_boost: rb, total: ms + rb, kind };
}

export function rank_notes<T extends { note: NoteMeta }>(
  items: readonly T[],
  context: RankingContext,
): Array<T & { ranked: RankedScore }> {
  return items
    .map((item) => ({ ...item, ranked: score_note(item.note, context) }))
    .sort((a, b) => b.ranked.total - a.ranked.total);
}
