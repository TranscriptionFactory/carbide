import { describe, expect, it } from "vitest";
import { rewrite_query } from "$lib/features/rag/domain/rag_query_rewriter";
import type { RagMessage } from "$lib/features/rag/domain/rag_types";

function user(content: string): RagMessage {
  return { id: content, role: "user", content, citations: [] };
}

function assistant(content: string, paths: string[] = []): RagMessage {
  return {
    id: content,
    role: "assistant",
    content,
    citations: paths.map((note_path, i) => ({
      index: i + 1,
      note_path,
      title: note_path,
    })),
  };
}

describe("rewrite_query", () => {
  it("resolves a bare follow-up against the prior question", () => {
    const history = [
      user("Does the project use Postgres?"),
      assistant("Yes, via SQLx.", ["db/postgres.md"]),
    ];

    const result = rewrite_query({ question: "why?", history });

    expect(result.rewritten).toBe(true);
    expect(result.query).toContain("Postgres");
    expect(result.query).not.toBe("why?");
  });

  it("resolves a pronoun-laden ellipsis against the prior question", () => {
    const history = [
      user("What databases does the project support?"),
      assistant("Postgres and SQLite.", ["db/index.md"]),
    ];

    const result = rewrite_query({
      question: "what about the second one?",
      history,
    });

    expect(result.rewritten).toBe(true);
    expect(result.query).toContain("databases");
  });

  it("leaves a self-contained question untouched", () => {
    const history = [
      user("Earlier topic"),
      assistant("Earlier answer", ["misc.md"]),
    ];

    const question = "How do I configure the embedding model in settings?";
    const result = rewrite_query({ question, history });

    expect(result.rewritten).toBe(false);
    expect(result.query).toBe(question);
    expect(result.boost_paths).toEqual([]);
  });

  it("does not rewrite a follow-up when there is no prior question", () => {
    const result = rewrite_query({ question: "why?", history: [] });

    expect(result.rewritten).toBe(false);
    expect(result.query).toBe("why?");
  });

  it("collects cited paths from recent assistant turns for a boost", () => {
    const history = [
      user("Tell me about auth"),
      assistant("...", ["auth/login.md", "auth/tokens.md"]),
    ];

    const result = rewrite_query({ question: "how does it work?", history });

    expect(result.boost_paths).toEqual(["auth/login.md", "auth/tokens.md"]);
  });
});
