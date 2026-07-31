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

  it("returns no history turns when there is none", () => {
    const { history, user_prompt } = build_rag_prompt({
      question: "How do I brew?",
      contexts,
      history: [],
    });

    expect(history).toEqual([]);
    expect(user_prompt).not.toContain("User:");
  });

  it("returns prior turns as real messages, stripping stale citations", () => {
    const history: RagMessage[] = [
      { id: "u1", role: "user", content: "What is pour over?", citations: [] },
      {
        id: "a1",
        role: "assistant",
        content: "A manual brew method [3].",
        citations: [],
      },
    ];

    const result = build_rag_prompt({
      question: "What temperature?",
      contexts,
      history,
    });

    expect(result.history).toEqual([
      { role: "user", content: "What is pour over?" },
      { role: "assistant", content: "A manual brew method." },
    ]);
    expect(result.user_prompt).not.toContain("User:");
    expect(result.user_prompt).not.toContain("Assistant:");
  });

  it("skips tool replay messages that no chat provider accepts", () => {
    const history: RagMessage[] = [
      { id: "u1", role: "user", content: "organize my notes", citations: [] },
      {
        id: "t1",
        role: "tool",
        content: '{"path":"notes/a.md"}',
        citations: [],
        tool_call_id: "call_1",
      },
      { id: "a1", role: "assistant", content: "Done.", citations: [] },
    ];

    const result = build_rag_prompt({
      question: "what changed?",
      contexts,
      history,
    });

    expect(result.history.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("drops leading assistant turns so the conversation opens on a user message", () => {
    const history: RagMessage[] = [
      { id: "a0", role: "assistant", content: "Earlier answer", citations: [] },
      { id: "u1", role: "user", content: "A follow up", citations: [] },
    ];

    const result = build_rag_prompt({
      question: "another",
      contexts,
      history,
    });

    expect(result.history).toEqual([{ role: "user", content: "A follow up" }]);
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

    const result = build_rag_prompt({
      question: "follow up",
      contexts,
      history,
      history_token_budget: 8,
    });

    const rendered = result.history.map((m) => m.content).join("\n");
    expect(rendered).toContain("NEWEST");
    expect(rendered).not.toContain("OLDEST");
  });
});
