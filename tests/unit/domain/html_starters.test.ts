import { describe, expect, it } from "vitest";
import {
  HTML_BLANK_SCAFFOLD,
  HTML_EMBED_STARTERS,
} from "$lib/shared/html/html_starters";

const ALL_SOURCES = [
  ...HTML_EMBED_STARTERS.map((starter) => starter.source),
  HTML_BLANK_SCAFFOLD,
];

describe("HTML_EMBED_STARTERS", () => {
  it("every source carries the token fallback chain", () => {
    for (const starter of HTML_EMBED_STARTERS) {
      expect(starter.source).toContain("--carbide-bg");
      expect(starter.source).toContain("--background");
    }
  });

  it("has unique ids", () => {
    const ids = HTML_EMBED_STARTERS.map((starter) => starter.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every starter has a label, description, and keywords", () => {
    for (const starter of HTML_EMBED_STARTERS) {
      expect(starter.label.length).toBeGreaterThan(0);
      expect(starter.description.length).toBeGreaterThan(0);
      expect(starter.keywords.length).toBeGreaterThan(0);
    }
  });
});

describe("starter sources", () => {
  it("never reference the network", () => {
    for (const source of ALL_SOURCES) {
      expect(source).not.toMatch(/https?:\/\//);
    }
  });

  it("scaffold contains a body element", () => {
    expect(HTML_BLANK_SCAFFOLD).toContain("<body");
  });
});
