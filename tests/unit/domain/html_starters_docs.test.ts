import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HTML_EMBED_STARTERS } from "$lib/shared/html/html_starters";

const DOC = readFileSync(
  new URL("../../../docs/html_artifacts.md", import.meta.url),
  "utf-8",
);

describe("html_artifacts.md starter docs", () => {
  it("documents inline HTML embeds and starter templates", () => {
    expect(DOC).toContain("## Inline HTML embeds");
    expect(DOC).toContain("## Starter templates");
  });

  it("contains every starter source verbatim", () => {
    for (const starter of HTML_EMBED_STARTERS) {
      expect(DOC).toContain(starter.source);
    }
  });
});
