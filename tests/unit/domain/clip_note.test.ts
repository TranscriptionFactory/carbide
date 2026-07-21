import { describe, expect, it } from "vitest";
import {
  build_clip_frontmatter,
  build_clip_provenance,
  clip_stem,
  is_valid_clip_url,
} from "$lib/features/clip/domain/clip_note";

describe("build_clip_frontmatter", () => {
  it("emits title, date_created, source, and clipped_at", () => {
    const clipped_at = new Date("2026-07-20T12:34:56.000Z");
    const frontmatter = build_clip_frontmatter(
      "My Article",
      "https://example.com/post",
      clipped_at,
    );
    expect(frontmatter).toBe(
      '---\ntitle: "My Article"\ndate_created: 2026-07-20\nsource: https://example.com/post\nclipped_at: 2026-07-20T12:34:56.000Z\n---\n\n',
    );
  });

  it("escapes double quotes in the title", () => {
    const frontmatter = build_clip_frontmatter(
      'The "Best" Post',
      "https://example.com",
      new Date(0),
    );
    expect(frontmatter).toContain('title: "The \\"Best\\" Post"');
  });
});

describe("build_clip_provenance", () => {
  it("uses the source url and stamps both timestamps", () => {
    const now = new Date("2026-07-20T10:00:00.000Z");
    expect(build_clip_provenance("https://example.com/a", now)).toEqual({
      source: "https://example.com/a",
      pasted_at: "2026-07-20T10:00:00.000Z",
      clipped_at: "2026-07-20T10:00:00.000Z",
    });
  });
});

describe("clip_stem", () => {
  it("slugifies the title", () => {
    expect(clip_stem("Hello, World!", "https://example.com")).toBe(
      "hello-world",
    );
  });

  it("falls back to the hostname when title is missing", () => {
    expect(clip_stem(null, "https://news.example.com/x")).toBe(
      "news-example-com",
    );
  });

  it("falls back to clipped-page when nothing slugifies", () => {
    expect(clip_stem("♥♥", "not a url")).toBe("clipped-page");
  });
});

describe("is_valid_clip_url", () => {
  it("accepts http and https urls", () => {
    expect(is_valid_clip_url("https://example.com/a")).toBe(true);
    expect(is_valid_clip_url("http://example.com")).toBe(true);
  });

  it("rejects other schemes and garbage", () => {
    expect(is_valid_clip_url("ftp://example.com")).toBe(false);
    expect(is_valid_clip_url("file:///etc/passwd")).toBe(false);
    expect(is_valid_clip_url("javascript:alert(1)")).toBe(false);
    expect(is_valid_clip_url("example.com")).toBe(false);
    expect(is_valid_clip_url("")).toBe(false);
  });
});
