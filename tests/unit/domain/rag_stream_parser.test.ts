import { describe, expect, it } from "vitest";
import { RagStreamParser } from "$lib/features/rag/domain/rag_stream_parser";
import { build_citation_map } from "$lib/features/rag/domain/rag_citations";
import type {
  RagCitation,
  RagStreamEvent,
} from "$lib/features/rag/domain/rag_types";

const citations: RagCitation[] = [
  { index: 1, note_path: "a.md", title: "A" },
  { index: 2, note_path: "b.md", title: "B" },
];

function run(...chunks: string[]): RagStreamEvent[] {
  const parser = new RagStreamParser(build_citation_map(citations));
  const events: RagStreamEvent[] = [];
  for (const chunk of chunks) events.push(...parser.push(chunk));
  events.push(...parser.flush());
  return events;
}

function text_of(events: RagStreamEvent[]): string {
  return events
    .filter(
      (e): e is Extract<RagStreamEvent, { type: "text" }> => e.type === "text",
    )
    .map((e) => e.text)
    .join("");
}

function citation_indices(events: RagStreamEvent[]): number[] {
  return events
    .filter(
      (e): e is Extract<RagStreamEvent, { type: "citation" }> =>
        e.type === "citation",
    )
    .map((e) => e.citation.index);
}

describe("RagStreamParser", () => {
  it("emits a citation once for a marker split across chunks", () => {
    const events = run("The answer is 42 [", "1].");
    expect(text_of(events)).toBe("The answer is 42 [1].");
    expect(citation_indices(events)).toEqual([1]);
  });

  it("emits a distinct citation per mapped marker, in order", () => {
    const events = run("See [1] and ", "also [2] for details.");
    expect(text_of(events)).toBe("See [1] and also [2] for details.");
    expect(citation_indices(events)).toEqual([1, 2]);
  });

  it("does not re-emit a citation whose index repeats", () => {
    const events = run("First [1], again [1].");
    expect(citation_indices(events)).toEqual([1]);
  });

  it("ignores markers that map to no source but keeps the text", () => {
    const events = run("Real [1], phantom [9].");
    expect(text_of(events)).toBe("Real [1], phantom [9].");
    expect(citation_indices(events)).toEqual([1]);
  });

  it("preserves the full text across many small chunks", () => {
    const events = run(..."Hello [1] world".split(""));
    expect(text_of(events)).toBe("Hello [1] world");
    expect(citation_indices(events)).toEqual([1]);
  });
});
