import type {
  RagMessage,
  RagRetrievedContext,
} from "$lib/features/rag/domain/rag_types";
import type { AiMessage } from "$lib/features/ai";
import { estimate_tokens } from "$lib/features/assistant";

const DEFAULT_HISTORY_TOKEN_BUDGET = 1500;
const CITATION_MARKER = /\s*\[\d+\]/g;

function section(label: string, value: string): string {
  return `<${label}>\n${value}\n</${label}>`;
}

const SYSTEM_PROMPT = [
  "You are a research assistant answering questions about the user's personal note vault.",
  "Use ONLY the retrieved notes provided in <retrieved_context> as evidence. Do not rely on outside knowledge.",
  "Earlier turns of this conversation arrive as prior messages; use them to interpret follow-up questions, but still answer using the retrieved notes as evidence.",
  "Cite every factual claim with a bracketed source number like [1] that matches the number of the source you used. You may cite multiple sources, e.g. [1][3].",
  "Only cite source numbers that appear in <retrieved_context>. Never invent a citation.",
  "If the retrieved notes do not contain enough information to answer, say you could not find it in the vault. Do not guess.",
  "Answer in clear, concise markdown.",
].join("\n");

function format_source(context: RagRetrievedContext): string {
  const attrs = `index="${context.index}" path="${context.note_path}" title="${context.title}"`;
  return `<source ${attrs}>\n${context.text}\n</source>`;
}

// Providers reject a conversation whose first non-system message is the
// assistant's, which truncation can easily produce.
function drop_leading_assistant(turns: AiMessage[]): AiMessage[] {
  let start = 0;
  while (turns[start]?.role === "assistant") start += 1;
  return turns.slice(start);
}

function build_history(
  history: RagMessage[],
  token_budget: number,
): AiMessage[] {
  const kept: AiMessage[] = [];
  let used = 0;
  for (const message of [...history].reverse()) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const content = message.content.replace(CITATION_MARKER, "").trim();
    if (content === "") continue;
    const cost = estimate_tokens(content);
    if (used + cost > token_budget) break;
    kept.unshift({ role: message.role, content });
    used += cost;
  }
  return drop_leading_assistant(kept);
}

export function build_rag_prompt(input: {
  question: string;
  contexts: RagRetrievedContext[];
  history?: RagMessage[];
  history_token_budget?: number;
}): { system_prompt: string; history: AiMessage[]; user_prompt: string } {
  const retrieved = input.contexts.map(format_source).join("\n\n");
  const user_prompt = [
    section("retrieved_context", retrieved),
    section("question", input.question.trim()),
  ].join("\n\n");

  return {
    system_prompt: SYSTEM_PROMPT,
    history: build_history(
      input.history ?? [],
      input.history_token_budget ?? DEFAULT_HISTORY_TOKEN_BUDGET,
    ),
    user_prompt,
  };
}
