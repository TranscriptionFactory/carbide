import type {
  ContextBlock,
  ContextSource,
} from "$lib/features/assistant/domain/context_source";

export type ContextBudget = {
  token_budget: number;
  reserve_tokens: number;
  chars_per_token: number;
  min_block_chars: number;
};

export type DropReason =
  | "empty"
  | "duplicate"
  | "over_limit"
  | "budget_exhausted";

export type AssembledBlock = ContextBlock & {
  index: number;
  source_id: string;
  truncated: boolean;
};

export type DroppedBlock = {
  id: string;
  source_id: string;
  note_path: string | null;
  reason: DropReason;
};

export type ContextStats = {
  candidates: number;
  used: number;
  truncated: number;
  dropped: number;
  chars_used: number;
  chars_available: number | null;
};

export type ContextAssembly = {
  blocks: AssembledBlock[];
  dropped: DroppedBlock[];
  stats: ContextStats;
};

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  token_budget: 8000,
  reserve_tokens: 2500,
  chars_per_token: 4,
  min_block_chars: 200,
};

const DEFAULT_CHARS_PER_TOKEN = 4;
const TRUNCATION_MARKER = "\n…[middle truncated]\n";
const TRUNCATION_HEAD_RATIO = 0.75;

export function estimate_tokens(
  text: string,
  chars_per_token = DEFAULT_CHARS_PER_TOKEN,
): number {
  return Math.ceil(text.length / chars_per_token);
}

type Candidate = {
  block: ContextBlock;
  source_id: string;
  dedup_group: string;
  text: string;
  truncated: boolean;
  drop_reason: DropReason | null;
};

// Total order: (source rank, descending score, id). Source rank is declared
// recipe intent and outranks score; id keeps the key total so ordering never
// falls through to Array.prototype.sort's stability.
function compare_blocks(a: ContextBlock, b: ContextBlock): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.id < b.id) return -1;
  return a.id > b.id ? 1 : 0;
}

function rank_source(source: ContextSource): Candidate[] {
  const dedup_group = source.dedup_group ?? source.id;
  const max_blocks = source.max_blocks ?? Number.POSITIVE_INFINITY;
  let kept = 0;

  return [...source.blocks].sort(compare_blocks).map((block) => {
    const candidate: Candidate = {
      block,
      source_id: source.id,
      dedup_group,
      text: block.text,
      truncated: false,
      drop_reason: null,
    };
    if (block.text.trim() === "") {
      candidate.drop_reason = "empty";
      return candidate;
    }
    if (kept >= max_blocks) {
      candidate.drop_reason = "over_limit";
      return candidate;
    }
    kept += 1;
    return candidate;
  });
}

function note_key(candidate: Candidate): string | null {
  const { note_path } = candidate.block;
  if (note_path === null) return null;
  return JSON.stringify([candidate.dedup_group, note_path]);
}

function drop_duplicates(candidates: Candidate[]): void {
  const seen_ids = new Set<string>();
  const seen_notes = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.drop_reason !== null) continue;
    const id = candidate.block.id;
    const key = note_key(candidate);

    if (seen_ids.has(id) || (key !== null && seen_notes.has(key))) {
      candidate.drop_reason = "duplicate";
      continue;
    }
    seen_ids.add(id);
    if (key !== null) seen_notes.add(key);
  }
}

function truncate_middle(text: string, keep: number): string {
  const head = Math.floor(keep * TRUNCATION_HEAD_RATIO);
  const tail = keep - head;
  return (
    text.slice(0, head) +
    TRUNCATION_MARKER +
    (tail > 0 ? text.slice(-tail) : "")
  );
}

// One block at most is truncated: the first that crosses the boundary. The
// budget then counts as spent and every later block is dropped.
function fill(
  candidates: Candidate[],
  available: number,
  used: number,
  budget: ContextBudget,
): number {
  let spent = used;
  let exhausted = false;

  for (const candidate of candidates) {
    if (exhausted) {
      candidate.drop_reason = "budget_exhausted";
      continue;
    }
    const remaining = available - spent;
    if (remaining < budget.min_block_chars) {
      candidate.drop_reason = "budget_exhausted";
      exhausted = true;
      continue;
    }
    if (candidate.text.length <= remaining) {
      spent += candidate.text.length;
      continue;
    }
    const keep = remaining - TRUNCATION_MARKER.length;
    if (keep < budget.min_block_chars) {
      candidate.drop_reason = "budget_exhausted";
      exhausted = true;
      continue;
    }
    candidate.text = truncate_middle(candidate.text, keep);
    candidate.truncated = true;
    spent = available;
    exhausted = true;
  }

  return spent;
}

// Pinned blocks reserve budget first so retrieval cannot starve them, but they
// are still emitted in declared order.
function apply_budget(candidates: Candidate[], budget: ContextBudget): number {
  const available = Math.max(
    0,
    (budget.token_budget - budget.reserve_tokens) * budget.chars_per_token,
  );
  const live = candidates.filter((c) => c.drop_reason === null);
  const used = fill(
    live.filter((c) => c.block.pinned),
    available,
    0,
    budget,
  );
  fill(
    live.filter((c) => !c.block.pinned),
    available,
    used,
    budget,
  );
  return available;
}

export function assemble_context(
  sources: ContextSource[],
  budget: ContextBudget | null,
): ContextAssembly {
  const candidates = sources.flatMap((source) => rank_source(source));
  drop_duplicates(candidates);
  const chars_available =
    budget === null ? null : apply_budget(candidates, budget);

  const blocks: AssembledBlock[] = [];
  const dropped: DroppedBlock[] = [];

  for (const candidate of candidates) {
    if (candidate.drop_reason !== null) {
      dropped.push({
        id: candidate.block.id,
        source_id: candidate.source_id,
        note_path: candidate.block.note_path,
        reason: candidate.drop_reason,
      });
      continue;
    }
    blocks.push({
      ...candidate.block,
      text: candidate.text,
      index: blocks.length + 1,
      source_id: candidate.source_id,
      truncated: candidate.truncated,
    });
  }

  return {
    blocks,
    dropped,
    stats: {
      candidates: candidates.length,
      used: blocks.length,
      truncated: blocks.filter((b) => b.truncated).length,
      dropped: dropped.length,
      chars_used: blocks.reduce((sum, b) => sum + b.text.length, 0),
      chars_available,
    },
  };
}
