import type { RagRetrievedContext } from "$lib/features/rag/domain/rag_types";

function section(label: string, value: string): string {
  return `<${label}>\n${value}\n</${label}>`;
}

const SYSTEM_PROMPT = [
  "You are a research assistant answering questions about the user's personal note vault.",
  "Use ONLY the retrieved notes provided in <retrieved_context> as evidence. Do not rely on outside knowledge.",
  "Cite every factual claim with a bracketed source number like [1] that matches the number of the source you used. You may cite multiple sources, e.g. [1][3].",
  "Only cite source numbers that appear in <retrieved_context>. Never invent a citation.",
  "If the retrieved notes do not contain enough information to answer, say you could not find it in the vault. Do not guess.",
  "Answer in clear, concise markdown.",
].join("\n");

function format_source(context: RagRetrievedContext): string {
  const attrs = `index="${context.index}" path="${context.note_path}" title="${context.title}"`;
  return `<source ${attrs}>\n${context.text}\n</source>`;
}

export function build_rag_prompt(input: {
  question: string;
  contexts: RagRetrievedContext[];
}): { system_prompt: string; user_prompt: string } {
  const retrieved = input.contexts.map(format_source).join("\n\n");
  const user_prompt = [
    section("retrieved_context", retrieved),
    section("question", input.question.trim()),
  ].join("\n\n");

  return { system_prompt: SYSTEM_PROMPT, user_prompt };
}
