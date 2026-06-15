import type { RagMessage } from "$lib/features/rag/domain/rag_types";

export type RagRewriteResult = {
  query: string;
  rewritten: boolean;
  boost_paths: string[];
};

const CONTINUATION_LEADS = new Set(["and", "but", "so", "then", "also"]);

const WH_LEADS = new Set([
  "why",
  "how",
  "what",
  "who",
  "whom",
  "when",
  "where",
  "which",
]);

const DEPENDENT_REFERENTS = new Set([
  "it",
  "its",
  "that",
  "this",
  "they",
  "them",
  "those",
  "these",
  "he",
  "she",
  "him",
  "her",
  "one",
  "ones",
]);

const MAX_DEPENDENT_WORDS = 8;
const MAX_ELLIPTICAL_WORDS = 3;
const BOOST_PATH_LIMIT = 8;

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

function is_dependent(question: string): boolean {
  const tokens = words(question);
  if (tokens.length === 0 || tokens.length > MAX_DEPENDENT_WORDS) return false;
  const [first] = tokens;
  if (first && CONTINUATION_LEADS.has(first)) return true;
  if (tokens.some((token) => DEPENDENT_REFERENTS.has(token))) return true;
  return Boolean(
    first && WH_LEADS.has(first) && tokens.length <= MAX_ELLIPTICAL_WORDS,
  );
}

function last_user_question(history: RagMessage[]): string | null {
  for (const message of [...history].reverse()) {
    if (message.role === "user" && message.content.trim() !== "") {
      return message.content.trim();
    }
  }
  return null;
}

function recent_cited_paths(history: RagMessage[]): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const message of [...history].reverse()) {
    if (paths.length >= BOOST_PATH_LIMIT) break;
    if (message.role !== "assistant") continue;
    for (const citation of message.citations) {
      if (seen.has(citation.note_path)) continue;
      seen.add(citation.note_path);
      paths.push(citation.note_path);
    }
  }
  return paths;
}

export function rewrite_query(input: {
  question: string;
  history: RagMessage[];
}): RagRewriteResult {
  const question = input.question.trim();

  if (is_dependent(question)) {
    const prior = last_user_question(input.history);
    if (prior) {
      return {
        query: `${prior} ${question}`,
        rewritten: true,
        boost_paths: recent_cited_paths(input.history),
      };
    }
  }

  return { query: question, rewritten: false, boost_paths: [] };
}
