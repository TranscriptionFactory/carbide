import type { RagRetrievedContext } from "$lib/features/rag/domain/rag_types";

export type RagContextCandidate = Omit<RagRetrievedContext, "index">;

export type AssembleContextOptions = {
  token_budget?: number;
  reserve_tokens?: number;
  chars_per_token?: number;
  min_context_chars?: number;
};

const DEFAULT_TOKEN_BUDGET = 8000;
const DEFAULT_RESERVE_TOKENS = 2500;
const DEFAULT_CHARS_PER_TOKEN = 4;
const DEFAULT_MIN_CONTEXT_CHARS = 200;
const TRUNCATION_MARKER = "\n…[middle truncated]\n";
const TRUNCATION_HEAD_RATIO = 0.75;

export function estimate_tokens(
  text: string,
  chars_per_token = DEFAULT_CHARS_PER_TOKEN,
): number {
  return Math.ceil(text.length / chars_per_token);
}

export function extract_section(
  markdown: string,
  start_line: number,
  end_line: number,
): string {
  const lines = markdown.split("\n");
  const start = Math.max(0, start_line);
  const end = Math.min(lines.length, end_line + 1);
  if (start >= lines.length || start >= end) return "";
  return lines.slice(start, end).join("\n");
}

function dedupe_by_path(
  candidates: RagContextCandidate[],
): RagContextCandidate[] {
  const seen = new Set<string>();
  const result: RagContextCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.note_path)) continue;
    seen.add(candidate.note_path);
    result.push(candidate);
  }
  return result;
}

export function assemble_context(
  candidates: RagContextCandidate[],
  options: AssembleContextOptions = {},
): RagRetrievedContext[] {
  const token_budget = options.token_budget ?? DEFAULT_TOKEN_BUDGET;
  const reserve_tokens = options.reserve_tokens ?? DEFAULT_RESERVE_TOKENS;
  const chars_per_token = options.chars_per_token ?? DEFAULT_CHARS_PER_TOKEN;
  const min_context_chars =
    options.min_context_chars ?? DEFAULT_MIN_CONTEXT_CHARS;

  const available_chars = Math.max(
    0,
    (token_budget - reserve_tokens) * chars_per_token,
  );

  const ranked = dedupe_by_path(
    [...candidates].sort((a, b) => b.score - a.score),
  );

  const assembled: RagRetrievedContext[] = [];
  let used_chars = 0;
  let index = 1;

  for (const candidate of ranked) {
    const remaining = available_chars - used_chars;
    if (remaining < min_context_chars) break;

    if (candidate.text.length <= remaining) {
      assembled.push({ ...candidate, index });
      used_chars += candidate.text.length;
    } else {
      const keep = remaining - TRUNCATION_MARKER.length;
      if (keep < min_context_chars) break;
      const head = Math.floor(keep * TRUNCATION_HEAD_RATIO);
      const tail = keep - head;
      assembled.push({
        ...candidate,
        index,
        text:
          candidate.text.slice(0, head) +
          TRUNCATION_MARKER +
          candidate.text.slice(-tail),
        truncated: true,
      });
      used_chars = available_chars;
    }
    index += 1;
  }

  return assembled;
}
