import { describe, expect, it } from "vitest";
import {
  build_rag_prompt,
  type RagMessage,
  type RagRetrievedContext,
} from "$lib/features/rag";

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

  it("omits the conversation section when there is no history", () => {
    const { user_prompt } = build_rag_prompt({
      question: "How do I brew?",
      contexts,
      history: [],
    });

    expect(user_prompt).not.toContain("<conversation>");
  });

  it("injects prior turns as a conversation section, stripping stale citations", () => {
    const history: RagMessage[] = [
      { id: "u1", role: "user", content: "What is pour over?", citations: [] },
      {
        id: "a1",
        role: "assistant",
        content: "A manual brew method [3].",
        citations: [],
      },
    ];

    const { user_prompt } = build_rag_prompt({
      question: "What temperature?",
      contexts,
      history,
    });

    expect(user_prompt).toContain("<conversation>");
    expect(user_prompt).toContain("User: What is pour over?");
    expect(user_prompt).toContain("Assistant: A manual brew method.");
    expect(user_prompt).not.toContain("[3]");
    expect(user_prompt.indexOf("<conversation>")).toBeLessThan(
      user_prompt.indexOf("<question>"),
    );
  });

  it("drops the oldest turns when history exceeds the token budget", () => {
    const history: RagMessage[] = [
      {
        id: "old",
        role: "user",
        content: "OLDEST question here",
        citations: [],
      },
      {
        id: "new",
        role: "user",
        content: "NEWEST question here",
        citations: [],
      },
    ];

    const { user_prompt } = build_rag_prompt({
      question: "follow up",
      contexts,
      history,
      history_token_budget: 8,
    });

    expect(user_prompt).toContain("NEWEST");
    expect(user_prompt).not.toContain("OLDEST");
  });
});
