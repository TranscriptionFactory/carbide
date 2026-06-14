import { describe, expect, it } from "vitest";
import { build_rag_prompt, type RagRetrievedContext } from "$lib/features/rag";

const contexts: RagRetrievedContext[] = [
  {
    index: 1,
    note_path: "notes/coffee.md",
    title: "Coffee",
    text: "Pour over at 94C.",
    score: 0.9,
    source: "both",
  },
  {
    index: 2,
    note_path: "notes/tea.md",
    title: "Tea",
    text: "Steep for three minutes.",
    score: 0.4,
    source: "vector",
  },
];

describe("build_rag_prompt", () => {
  it("instructs retrieval-first answering with citations in the system prompt", () => {
    const { system_prompt } = build_rag_prompt({
      question: "How do I brew?",
      contexts,
    });

    expect(system_prompt).toContain("retrieved notes");
    expect(system_prompt).toMatch(/\[1\]/);
    expect(system_prompt.toLowerCase()).toContain("never invent a citation");
  });

  it("renders each source with its index, path and title", () => {
    const { user_prompt } = build_rag_prompt({
      question: "How do I brew?",
      contexts,
    });

    expect(user_prompt).toContain(
      '<source index="1" path="notes/coffee.md" title="Coffee">',
    );
    expect(user_prompt).toContain("Pour over at 94C.");
    expect(user_prompt).toContain(
      '<source index="2" path="notes/tea.md" title="Tea">',
    );
    expect(user_prompt).toContain("</source>");
  });

  it("wraps the trimmed question in a question section", () => {
    const { user_prompt } = build_rag_prompt({
      question: "  How do I brew?  ",
      contexts,
    });

    expect(user_prompt).toContain("<question>\nHow do I brew?\n</question>");
  });
});
