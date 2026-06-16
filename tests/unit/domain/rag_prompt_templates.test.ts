import { describe, expect, it } from "vitest";
import {
  RAG_TEMPLATES,
  scope_phrase,
} from "$lib/features/rag/domain/rag_prompt_templates";

describe("scope_phrase", () => {
  it("falls back to the whole vault when scope is empty", () => {
    expect(scope_phrase({})).toBe("my vault");
  });

  it("names a single folder without trailing slash", () => {
    expect(scope_phrase({ folders: ["Projects/"] })).toBe('the folder "Projects"');
  });

  it("pluralizes and joins multiple folders", () => {
    expect(scope_phrase({ folders: ["A", "B"] })).toBe('the folders "A" and "B"');
  });

  it("renders tags with a leading hash, deduping existing hashes", () => {
    expect(scope_phrase({ tags: ["#work", "ml"] })).toBe(
      "notes tagged #work and #ml",
    );
  });

  it("combines folders, tags, and bases into one phrase", () => {
    expect(
      scope_phrase({ folders: ["Daily"], tags: ["journal"], bases: ["Reading"] }),
    ).toBe('the folder "Daily", notes tagged #journal and the "Reading" view');
  });
});

describe("RAG_TEMPLATES", () => {
  it("exposes the four shipped templates", () => {
    expect(RAG_TEMPLATES.map((t) => t.id)).toEqual([
      "summarize_scope",
      "extract_action_items",
      "open_questions",
      "timeline",
    ]);
  });

  it("interpolates the active scope into each query", () => {
    const scope = { tags: ["research"] };
    for (const template of RAG_TEMPLATES) {
      expect(template.build(scope)).toContain("notes tagged #research");
    }
  });

  it("targets the whole vault when unscoped", () => {
    expect(RAG_TEMPLATES[0].build({})).toBe(
      "Summarize the key points and themes across my vault.",
    );
  });
});
