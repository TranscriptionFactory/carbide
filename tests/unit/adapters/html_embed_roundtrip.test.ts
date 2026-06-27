import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import {
  parse_html_embed,
  serialize_web_embed,
  serialize_video,
} from "$lib/features/editor/adapters/html_embed";

describe("parse_html_embed", () => {
  it("parses an iframe into a web_embed", () => {
    const parsed = parse_html_embed(
      `<iframe src="https://example.com/x" width="640" height="360"></iframe>`,
    );
    expect(parsed).toEqual({
      kind: "web_embed",
      src: "https://example.com/x",
      title: "",
      width: "640",
      height: "360",
      align: "center",
    });
  });

  it("parses data-align on an iframe", () => {
    const parsed = parse_html_embed(
      `<iframe src="https://x.com" data-align="right"></iframe>`,
    );
    expect(parsed && parsed.kind === "web_embed" && parsed.align).toBe("right");
  });

  it("parses a video with boolean attributes", () => {
    const parsed = parse_html_embed(
      `<video src="clip.mp4" poster="p.jpg" controls muted loop></video>`,
    );
    expect(parsed).toEqual({
      kind: "video",
      src: "clip.mp4",
      poster: "p.jpg",
      width: "",
      height: "",
      controls: true,
      autoplay: false,
      loop: true,
      muted: true,
    });
  });

  it("rejects an iframe with no src", () => {
    expect(parse_html_embed(`<iframe width="640"></iframe>`)).toBeNull();
  });

  it("rejects unrelated html", () => {
    expect(parse_html_embed(`<div>hi</div>`)).toBeNull();
  });
});

describe("html embed markdown round-trip", () => {
  function roundtrip(input: string): string {
    return serialize_markdown(parse_markdown(input)).trim();
  }

  it("round-trips an iframe embed (block html node)", () => {
    const input = `<iframe src="https://example.com/x" width="640" height="360"></iframe>`;
    const doc = parse_markdown(input);
    expect(doc.child(0).type.name).toBe("web_embed");
    expect(doc.child(0).attrs["src"]).toBe("https://example.com/x");
    expect(roundtrip(input)).toBe(input);
  });

  it("round-trips a video (paragraph-wrapped html node)", () => {
    const input = `<video src="clip.mp4" controls></video>`;
    const doc = parse_markdown(input);
    expect(doc.child(0).type.name).toBe("video");
    expect(doc.child(0).attrs["controls"]).toBe(true);
    expect(roundtrip(input)).toBe(input);
  });

  it("round-trips a video with poster and multiple booleans", () => {
    const input = `<video src="clip.mp4" poster="p.jpg" width="640" controls loop muted></video>`;
    expect(roundtrip(input)).toBe(input);
  });

  it("normalizes attribute order but preserves meaning", () => {
    const out = roundtrip(`<video src="clip.mp4" muted controls loop></video>`);
    expect(out).toBe(`<video src="clip.mp4" controls loop muted></video>`);
    const reparsed = parse_html_embed(out);
    expect(reparsed).toMatchObject({
      kind: "video",
      controls: true,
      loop: true,
      muted: true,
    });
  });

  it("round-trips an iframe with title and right alignment", () => {
    const input = `<iframe src="https://x.com" title="Demo" data-align="right"></iframe>`;
    expect(roundtrip(input)).toBe(input);
  });

  it("preserves surrounding prose around an embed", () => {
    const input = `before\n\n<iframe src="https://x.com"></iframe>\n\nafter`;
    const out = roundtrip(input);
    expect(out).toContain(`<iframe src="https://x.com"></iframe>`);
    expect(out).toContain("before");
    expect(out).toContain("after");
  });
});

describe("serialize helpers omit defaults", () => {
  it("omits empty optional attrs on a web_embed", () => {
    expect(
      serialize_web_embed({
        src: "https://x.com",
        title: "",
        width: "",
        height: "",
        align: "center",
      }),
    ).toBe(`<iframe src="https://x.com"></iframe>`);
  });

  it("omits false booleans on a video", () => {
    expect(
      serialize_video({
        src: "clip.mp4",
        poster: "",
        width: "",
        height: "",
        controls: false,
        autoplay: false,
        loop: false,
        muted: false,
      }),
    ).toBe(`<video src="clip.mp4"></video>`);
  });
});
