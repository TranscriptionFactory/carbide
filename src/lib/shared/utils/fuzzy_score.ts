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

  // DP: M[i][j] = best score matching q[0..i] with q[i] aligned to t[j]
  // parent[i][j] = column in previous row that produced M[i][j] (-1 for first row)
  const M: number[][] = Array.from({ length: n }, () =>
    new Array<number>(m).fill(-Infinity),
  );
  const parent: number[][] = Array.from({ length: n }, () =>
    new Array<number>(m).fill(-1),
  );

  // First row: match q[0] at each valid t position
  for (let j = 0; j < m; j++) {
    if (t[j] === q[0]) {
      M[0]![j] = SCORE_MATCH + match_bonus(target, j);
    }
  }

  // Fill rows 1..n-1
  for (let i = 1; i < n; i++) {
    const prev_row = M[i - 1]!;
    // Track best (prev_row[k] + gap_penalty from k to j) for k <= j-2
    // gap_penalty(k, j) = PENALTY_GAP_START + PENALTY_GAP_EXTEND * (j - k - 2)
    // = prev_row[k] - PENALTY_GAP_EXTEND * k  +  PENALTY_GAP_START + PENALTY_GAP_EXTEND * (j - 2)
    // So we track: max of (prev_row[k] - PENALTY_GAP_EXTEND * k) for valid k
    let best_adjusted = -Infinity;
    let best_adjusted_col = -1;

    for (let j = i; j < m; j++) {
      // Update best_adjusted with prev_row[j-2] (gap of at least 1)
      if (j >= 2 && prev_row[j - 2]! > -Infinity) {
        const adj = prev_row[j - 2]! - PENALTY_GAP_EXTEND * (j - 2);
        if (adj > best_adjusted) {
          best_adjusted = adj;
          best_adjusted_col = j - 2;
        }
      }

      if (t[j] !== q[i]) continue;

      const bonus = SCORE_MATCH + match_bonus(target, j);
      let best_prev = -Infinity;
      let best_prev_col = -1;

      // Option 1: consecutive from j-1
      if (j >= 1 && prev_row[j - 1]! > -Infinity) {
        const consecutive_score = prev_row[j - 1]! + SCORE_CONSECUTIVE + bonus;
        if (consecutive_score > best_prev) {
          best_prev = consecutive_score;
          best_prev_col = j - 1;
        }
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
          best_prev_col = best_adjusted_col;
        }
      }

      if (best_prev > -Infinity) {
        M[i]![j] = best_prev;
        parent[i]![j] = best_prev_col;
      }
    }
  }

  // Find best score in last row
  let best_score = -Infinity;
  let best_col = -1;
  const last_row = M[n - 1]!;
  for (let j = n - 1; j < m; j++) {
    if (last_row[j]! > best_score) {
      best_score = last_row[j]!;
      best_col = j;
    }
  }

  if (best_score === -Infinity) return null;

  // Backtrack to recover indices
  const indices = new Array<number>(n);
  let col = best_col;
  for (let i = n - 1; i >= 0; i--) {
    indices[i] = col;
    col = parent[i]![col]!;
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
