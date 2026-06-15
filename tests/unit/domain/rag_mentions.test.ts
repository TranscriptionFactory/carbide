import { describe, expect, it } from "vitest";
import { parse_mentions } from "$lib/features/rag";

describe("parse_mentions", () => {
  it("returns no mentions and the original question when none are present", () => {
    const result = parse_mentions("what changed last week?");
    expect(result.mentions).toEqual([]);
    expect(result.cleaned_question).toBe("what changed last week?");
  });

  it("extracts a mention and strips the @ marker from the question", () => {
    const result = parse_mentions("summarize @ProjectX please");
    expect(result.mentions).toEqual(["ProjectX"]);
    expect(result.cleaned_question).toBe("summarize ProjectX please");
  });

  it("collects multiple distinct mentions", () => {
    const result = parse_mentions("compare @alpha and @beta");
    expect(result.mentions).toEqual(["alpha", "beta"]);
    expect(result.cleaned_question).toBe("compare alpha and beta");
  });

  it("dedupes a mention repeated in the question", () => {
    const result = parse_mentions("@notes/a vs @notes/a again");
    expect(result.mentions).toEqual(["notes/a"]);
  });

  it("captures path-like mentions with slashes and extensions", () => {
    const result = parse_mentions("read @notes/spec.md closely");
    expect(result.mentions).toEqual(["notes/spec.md"]);
  });
});
