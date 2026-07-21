import { describe, expect, it } from "vitest";
import {
  format_mention_token,
  parse_mentions,
  strip_mention,
} from "$lib/features/rag";

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

  it("extracts a delimited mention containing spaces", () => {
    const result = parse_mentions("summarize @[My Meeting Notes] please");
    expect(result.mentions).toEqual(["My Meeting Notes"]);
    expect(result.cleaned_question).toBe("summarize My Meeting Notes please");
  });

  it("mixes bare and delimited mentions in one question", () => {
    const result = parse_mentions("compare @alpha with @[Beta Draft]");
    expect(result.mentions).toEqual(["alpha", "Beta Draft"]);
    expect(result.cleaned_question).toBe("compare alpha with Beta Draft");
  });

  it("dedupes the same target across bare and delimited forms", () => {
    const result = parse_mentions("@spec vs @[spec]");
    expect(result.mentions).toEqual(["spec"]);
  });

  it("trims whitespace inside a delimited mention", () => {
    const result = parse_mentions("read @[ spaced title ] now");
    expect(result.mentions).toEqual(["spaced title"]);
  });

  it("does not treat an unclosed bracket as a mention", () => {
    const result = parse_mentions("read @[unclosed now");
    expect(result.mentions).toEqual([]);
    expect(result.cleaned_question).toBe("read @[unclosed now");
  });
});

describe("format_mention_token", () => {
  it("uses the bare form when the target fits the bare charset", () => {
    expect(format_mention_token("notes/spec.md")).toBe("@notes/spec.md");
  });

  it("uses the delimited form when the target has spaces", () => {
    expect(format_mention_token("My Meeting Notes")).toBe(
      "@[My Meeting Notes]",
    );
  });

  it("uses the delimited form for any character outside the bare charset", () => {
    expect(format_mention_token("q&a")).toBe("@[q&a]");
  });
});

describe("strip_mention", () => {
  it("removes a bare mention token and tidies spacing", () => {
    expect(strip_mention("summarize @spec please", "spec")).toBe(
      "summarize please",
    );
  });

  it("removes a delimited mention token", () => {
    expect(strip_mention("summarize @[My Note] please", "My Note")).toBe(
      "summarize please",
    );
  });

  it("leaves other mentions untouched", () => {
    expect(strip_mention("compare @alpha and @beta", "alpha")).toBe(
      "compare and @beta",
    );
  });

  it("does not remove a longer mention sharing a prefix", () => {
    expect(strip_mention("read @alpha and @alphabet", "alpha")).toBe(
      "read and @alphabet",
    );
  });
});
