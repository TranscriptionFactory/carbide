import { describe, expect, it } from "vitest";
import { link_first_mention } from "$lib/features/links/domain/link_mention";

describe("link_first_mention", () => {
  it("wraps the first whole-word mention in a wiki-link", () => {
    const { markdown, changed } = link_first_mention(
      "I read Deep Work today and Deep Work again.",
      "Deep Work",
    );
    expect(changed).toBe(true);
    expect(markdown).toBe("I read [[Deep Work]] today and Deep Work again.");
  });

  it("matches case-insensitively but links the canonical title", () => {
    const { markdown, changed } = link_first_mention(
      "notes about machine learning here",
      "Machine Learning",
    );
    expect(changed).toBe(true);
    expect(markdown).toBe("notes about [[Machine Learning]] here");
  });

  it("does not double-link an existing wiki-link", () => {
    const { changed } = link_first_mention("see [[Topic]] now", "Topic");
    expect(changed).toBe(false);
  });

  it("ignores partial-word matches", () => {
    const { changed } = link_first_mention("Topical things", "Topic");
    expect(changed).toBe(false);
  });

  it("skips mentions inside fenced code blocks", () => {
    const md = ["```", "Topic", "```", "Topic outside"].join("\n");
    const { markdown, changed } = link_first_mention(md, "Topic");
    expect(changed).toBe(true);
    expect(markdown).toBe(
      ["```", "Topic", "```", "[[Topic]] outside"].join("\n"),
    );
  });

  it("returns unchanged when the title is absent", () => {
    const result = link_first_mention("nothing here", "Topic");
    expect(result).toEqual({ markdown: "nothing here", changed: false });
  });

  it("returns unchanged for an empty title", () => {
    const result = link_first_mention("anything", "  ");
    expect(result.changed).toBe(false);
  });
});
