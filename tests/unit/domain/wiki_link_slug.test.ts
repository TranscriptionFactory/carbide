import { describe, expect, it } from "vitest";
import {
  disambiguate_slug,
  get_heading_slug,
  to_wiki_link_slug,
} from "$lib/features/editor/domain/wiki_link_slug";

describe("to_wiki_link_slug", () => {
  it("normalizes human-readable page names to doc slugs", () => {
    expect(to_wiki_link_slug("Nonexistent Page")).toBe("nonexistent-page");
    expect(to_wiki_link_slug("  Mixed_CASE  Page  ")).toBe("mixed-case-page");
  });

  it("keeps Unicode-safe slugs stable across scripts", () => {
    expect(to_wiki_link_slug("Café Menu")).toBe("cafe-menu");
    expect(to_wiki_link_slug("東京 2026")).toBe("東京-2026");
  });

  it("strips edge hyphens from non-alphanumeric boundaries", () => {
    expect(to_wiki_link_slug("!! hello !!")).toBe("hello");
  });
});

describe("disambiguate_slug", () => {
  it("returns the base slug the first time and suffixes repeats", () => {
    const counts = new Map<string, number>();
    expect(disambiguate_slug("intro", counts)).toBe("intro");
    expect(disambiguate_slug("intro", counts)).toBe("intro-1");
    expect(disambiguate_slug("intro", counts)).toBe("intro-2");
  });
});

describe("get_heading_slug", () => {
  it("slugifies and disambiguates heading text", () => {
    const counts = new Map<string, number>();
    expect(get_heading_slug("My Heading", counts)).toBe("my-heading");
    expect(get_heading_slug("My Heading", counts)).toBe("my-heading-1");
  });

  it("returns an empty slug for content with no slug characters", () => {
    expect(get_heading_slug("!!!", new Map())).toBe("");
  });
});
