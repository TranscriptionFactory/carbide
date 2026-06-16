import { describe, expect, it } from "vitest";
import { link_mentions } from "$lib/features/links/domain/link_mention";

describe("link_mentions", () => {
  it("wraps every whole-word mention in a wiki-link", () => {
    const { markdown, changed } = link_mentions(
      "I read Deep Work today and Deep Work again.",
      "Deep Work",
    );
    expect(changed).toBe(true);
    expect(markdown).toBe(
      "I read [[Deep Work]] today and [[Deep Work]] again.",
    );
  });

  it("matches case-insensitively but links the canonical title", () => {
    const { markdown, changed } = link_mentions(
      "notes about machine learning here",
      "Machine Learning",
    );
    expect(changed).toBe(true);
    expect(markdown).toBe("notes about [[Machine Learning]] here");
  });

  it("links bare mentions while leaving an existing wiki-link untouched", () => {
    const { markdown, changed } = link_mentions(
      "see [[Topic]] and Topic now",
      "Topic",
    );
    expect(changed).toBe(true);
    expect(markdown).toBe("see [[Topic]] and [[Topic]] now");
  });

  it("does not double-link when only an existing wiki-link is present", () => {
    const { changed } = link_mentions("see [[Topic]] now", "Topic");
    expect(changed).toBe(false);
  });

  it("ignores partial-word matches", () => {
    const { changed } = link_mentions("Topical things", "Topic");
    expect(changed).toBe(false);
  });

  it("skips mentions inside fenced code blocks", () => {
    const md = ["```", "Topic", "```", "Topic outside"].join("\n");
    const { markdown, changed } = link_mentions(md, "Topic");
    expect(changed).toBe(true);
    expect(markdown).toBe(
      ["```", "Topic", "```", "[[Topic]] outside"].join("\n"),
    );
  });

  it("returns unchanged when the title is absent", () => {
    const result = link_mentions("nothing here", "Topic");
    expect(result).toEqual({ markdown: "nothing here", changed: false });
  });

  it("returns unchanged for an empty title", () => {
    const result = link_mentions("anything", "  ");
    expect(result.changed).toBe(false);
  });
});
