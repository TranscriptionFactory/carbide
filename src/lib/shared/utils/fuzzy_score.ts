export type FuzzyResult = { score: number; indices: number[] };

const SCORE_CONSECUTIVE = 8;
const SCORE_BOUNDARY = 10;
const SCORE_START = 12;
const SCORE_MATCH = 1;
const PENALTY_GAP_START = -3;
const PENALTY_GAP_EXTEND = -1;

function is_boundary(prev: string, curr: string): boolean {
  if (
    prev === "/" ||
    prev === "-" ||
    prev === "_" ||
    prev === " " ||
    prev === "."
  )
    return true;
  if (prev === prev.toLowerCase() && curr === curr.toUpperCase()) return true;
  return false;
}

function match_bonus(target: string, ti: number): number {
  if (ti === 0) return SCORE_START;
  if (is_boundary(target[ti - 1] ?? "", target[ti] ?? ""))
    return SCORE_BOUNDARY;
  return 0;
}

const MAX_REUSE = 256;
const _reuse_a = new Float64Array(MAX_REUSE);
const _reuse_b = new Float64Array(MAX_REUSE);

export function fuzzy_score(query: string, target: string): FuzzyResult | null {
  const n = query.length;
  const m = target.length;
  if (n === 0 || n > m) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Quick feasibility check: greedy forward scan
  let qi = 0;
  for (let ti = 0; ti < m && qi < n; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  if (qi !== n) return null;

  // Single-char fast path
  if (n === 1) {
    let best_j = -1;
    let best_s = -Infinity;
    for (let j = 0; j < m; j++) {
      if (t[j] === q[0]) {
        const s = SCORE_MATCH + match_bonus(target, j);
        if (s > best_s) {
          best_s = s;
          best_j = j;
        }
      }
    }
    if (best_j < 0) return null;
    return { score: best_s, indices: [best_j] };
  }

  // Rolling 2-row DP. No parent tracking — indices are reconstructed
  // via a second backward pass only when needed (currently no callers
  // use indices, but we keep the contract).
  const can_reuse = m <= MAX_REUSE;
  let prev_row: Float64Array = can_reuse
    ? _reuse_a.subarray(0, m)
    : new Float64Array(m);
  let curr_row: Float64Array = can_reuse
    ? _reuse_b.subarray(0, m)
    : new Float64Array(m);

  // Init prev_row (row 0): match q[0] at each valid t position
  prev_row.fill(-Infinity);
  for (let j = 0; j < m; j++) {
    if (t[j] === q[0]) {
      prev_row[j] = SCORE_MATCH + match_bonus(target, j);
    }
  }

  // Fill rows 1..n-1
  for (let i = 1; i < n; i++) {
    curr_row.fill(-Infinity);

    let best_adjusted = -Infinity;

    for (let j = i; j < m; j++) {
      // Update best_adjusted with prev_row[j-2] (gap of at least 1)
      if (j >= 2 && prev_row[j - 2]! > -Infinity) {
        const adj = prev_row[j - 2]! - PENALTY_GAP_EXTEND * (j - 2);
        if (adj > best_adjusted) {
          best_adjusted = adj;
        }
      }

      if (t[j] !== q[i]) continue;

      const bonus = SCORE_MATCH + match_bonus(target, j);
      let best_prev = -Infinity;

      // Option 1: consecutive from j-1
      if (j >= 1 && prev_row[j - 1]! > -Infinity) {
        best_prev = prev_row[j - 1]! + SCORE_CONSECUTIVE + bonus;
      }

      // Option 2: gap transition from some k <= j-2
      if (best_adjusted > -Infinity) {
        const gap_score =
          best_adjusted +
          PENALTY_GAP_START +
          PENALTY_GAP_EXTEND * (j - 2) +
          bonus;
        if (gap_score > best_prev) {
          best_prev = gap_score;
        }
      }

      if (best_prev > -Infinity) {
        curr_row[j] = best_prev;
      }
    }

    // Swap rows
    const tmp = prev_row;
    prev_row = curr_row;
    curr_row = tmp;
  }

  // Find best score in last row (now in prev_row after swap)
  let best_score = -Infinity;
  let best_col = -1;
  for (let j = n - 1; j < m; j++) {
    if (prev_row[j]! > best_score) {
      best_score = prev_row[j]!;
      best_col = j;
    }
  }

  if (best_score === -Infinity) return null;

  // Reconstruct indices via greedy backward scan.
  // Walk backwards through t matching q chars, preferring consecutive
  // and boundary positions (mirrors the DP scoring priorities).
  const indices = new Array<number>(n);
  indices[n - 1] = best_col;
  let ti = best_col - 1;
  for (let i = n - 2; i >= 0; i--) {
    while (ti >= i && t[ti] !== q[i]) ti--;
    indices[i] = ti;
    ti--;
  }

  return { score: best_score, indices };
}

export function fuzzy_score_multi(
  query: string,
  targets: string[],
): FuzzyResult | null {
  let best: FuzzyResult | null = null;
  for (const target of targets) {
    const result = fuzzy_score(query, target);
    if (result && (best === null || result.score > best.score)) {
      best = result;
    }
  }
  return best;
}

export function fuzzy_score_fields(query: string, fields: string[]): number {
  return fuzzy_score_multi(query, fields)?.score ?? 0;
}
