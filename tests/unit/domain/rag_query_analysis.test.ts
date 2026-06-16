import { describe, expect, it } from "vitest";
import { analyze_query } from "$lib/features/rag/domain/rag_query_analysis";
import type { DateRange } from "$lib/shared/types/search";

const DAY_MS = 86_400_000;
const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();

function range_of(question: string): DateRange {
  const { date_range } = analyze_query(question, NOW);
  if (date_range === null)
    throw new Error(`expected a date range: ${question}`);
  return date_range;
}

describe("analyze_query topic extraction", () => {
  it("reduces a meta-query to its bare topic", () => {
    const { topic } = analyze_query(
      "tell me about the notes I wrote about metaboloformer last week",
      NOW,
    );
    expect(topic).toBe("metaboloformer");
  });

  it("strips leading filler phrases", () => {
    expect(
      analyze_query("summarize my notes on transformer attention", NOW).topic,
    ).toBe("transformer attention");
    expect(
      analyze_query("what did I write about batch normalization", NOW).topic,
    ).toBe("batch normalization");
    expect(
      analyze_query("show me notes about gradient clipping", NOW).topic,
    ).toBe("gradient clipping");
  });

  it("leaves a self-contained question untouched", () => {
    const question = "how does the embedding model handle batching";
    const { topic, date_range } = analyze_query(question, NOW);
    expect(topic).toBe(question);
    expect(date_range).toBeNull();
  });

  it("preserves content-bearing words at the topic edges", () => {
    expect(
      analyze_query("summarize my notes on release notes", NOW).topic,
    ).toBe("release notes");
    expect(
      analyze_query("what did I write about the model I created", NOW).topic,
    ).toBe("model I created");
  });

  it("yields an empty topic when only filler and a date remain", () => {
    const { topic, date_range } = analyze_query(
      "what did I write last week",
      NOW,
    );
    expect(topic).toBe("");
    expect(date_range).not.toBeNull();
  });
});

describe("analyze_query date ranges", () => {
  it("returns no range when no date phrase is present", () => {
    expect(
      analyze_query("metaboloformer architecture", NOW).date_range,
    ).toBeNull();
  });

  it("resolves 'last week' to the previous calendar week", () => {
    const range = range_of("notes from last week");
    expect(range.end_ms - range.start_ms).toBe(7 * DAY_MS);
    expect(range.end_ms).toBeLessThanOrEqual(NOW);
  });

  it("resolves an explicit 'last N days' window", () => {
    const range = range_of("anything about rag in the last 3 days");
    expect(range).toEqual({ start_ms: NOW - 3 * DAY_MS, end_ms: NOW });
  });

  it("resolves 'yesterday' to a one-day window ending today", () => {
    const range = range_of("what did I note yesterday");
    expect(range.end_ms - range.start_ms).toBe(DAY_MS);
    expect(range.end_ms).toBeLessThanOrEqual(NOW);
  });

  it("resolves 'today' to a window ending at now", () => {
    const range = range_of("today's notes on clustering");
    expect(range.end_ms).toBe(NOW);
    expect(range.start_ms).toBeLessThan(NOW);
  });

  it("prefers the numeric window over the bare 'last week' rule", () => {
    const { date_range } = analyze_query("notes from the last 2 weeks", NOW);
    expect(date_range).toEqual({ start_ms: NOW - 14 * DAY_MS, end_ms: NOW });
  });

  it("removes the date phrase from the extracted topic", () => {
    const { topic } = analyze_query("metaboloformer training this week", NOW);
    expect(topic).toBe("metaboloformer training");
  });
});
