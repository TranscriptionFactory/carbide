import type {
  RagMessage,
  RagRetrievedContext,
} from "$lib/features/rag/domain/rag_types";
import { estimate_tokens } from "$lib/features/rag/domain/rag_context_assembler";

const DEFAULT_HISTORY_TOKEN_BUDGET = 1500;
const CITATION_MARKER = /\s*\[\d+\]/g;

function section(label: string, value: string): string {
  return `<${label}>\n${value}\n</${label}>`;
}

const SYSTEM_PROMPT = [
  "You are a research assistant answering questions about the user's personal note vault.",
  "Use ONLY the retrieved notes provided in <retrieved_context> as evidence. Do not rely on outside knowledge.",
  "If a <conversation> section is present, use it to interpret follow-up questions, but still answer using the retrieved notes as evidence.",
  "Cite every factual claim with a bracketed source number like [1] that matches the number of the source you used. You may cite multiple sources, e.g. [1][3].",
  "Only cite source numbers that appear in <retrieved_context>. Never invent a citation.",
  "If the retrieved notes do not contain enough information to answer, say you could not find it in the vault. Do not guess.",
  "Answer in clear, concise markdown.",
].join("\n");

function format_source(context: RagRetrievedContext): string {
  const attrs = `index="${context.index}" path="${context.note_path}" title="${context.title}"`;
  return `<source ${attrs}>\n${context.text}\n</source>`;
}

function format_turn(message: RagMessage): string {
  const role = message.role === "user" ? "User" : "Assistant";
  const content = message.content.replace(CITATION_MARKER, "").trim();
  return `${role}: ${content}`;
}

function build_history(history: RagMessage[], token_budget: number): string {
  const kept: string[] = [];
  let used = 0;
  for (const message of [...history].reverse()) {
    if (message.content.trim() === "") continue;
    const line = format_turn(message);
    const cost = estimate_tokens(line);
    if (used + cost > token_budget) break;
    kept.unshift(line);
    used += cost;
  }
  return kept.join("\n");
}

export function build_rag_prompt(input: {
  question: string;
  contexts: RagRetrievedContext[];
  history?: RagMessage[];
  history_token_budget?: number;
}): { system_prompt: string; user_prompt: string } {
  const retrieved = input.contexts.map(format_source).join("\n\n");
  const history_text = build_history(
    input.history ?? [],
    input.history_token_budget ?? DEFAULT_HISTORY_TOKEN_BUDGET,
  );

  const sections = [section("retrieved_context", retrieved)];
  if (history_text !== "") {
    sections.push(section("conversation", history_text));
  }
  sections.push(section("question", input.question.trim()));

  return { system_prompt: SYSTEM_PROMPT, user_prompt: sections.join("\n\n") };
}
