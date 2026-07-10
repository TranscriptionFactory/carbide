import { describe, it, expect } from "vitest";
import { extract_note_image_targets } from "$lib/features/ai/domain/note_image_refs";

describe("extract_note_image_targets", () => {
  it("extracts relative markdown image targets", () => {
    const md = "# Title\n\n![alt](.assets/photo.png)\n\ntext";
    expect(extract_note_image_targets(md)).toEqual([".assets/photo.png"]);
  });

  it("extracts wiki embed image targets", () => {
    const md = "before\n\n![[.assets/shot.jpg]]\n\nafter";
    expect(extract_note_image_targets(md)).toEqual([".assets/shot.jpg"]);
  });

  it("supports wiki embeds with display text", () => {
    const md = "![[.assets/shot.webp|caption]]";
    expect(extract_note_image_targets(md)).toEqual([".assets/shot.webp"]);
  });

  it("dedupes repeated targets", () => {
    const md = "![a](img.png)\n\n![b](img.png)\n\n![[img.png]]";
    expect(extract_note_image_targets(md)).toEqual(["img.png"]);
  });

  it("skips external and data URLs", () => {
    const md =
      "![a](https://example.com/x.png)\n\n![b](data:image/png;base64,abc)\n\n![c](//cdn/x.jpg)";
    expect(extract_note_image_targets(md)).toEqual([]);
  });

  it("skips non-image extensions and svg", () => {
    const md = "![a](doc.pdf)\n\n![[video.mp4]]\n\n![b](vector.svg)";
    expect(extract_note_image_targets(md)).toEqual([]);
  });

  it("collects multiple distinct targets", () => {
    const md = "![a](one.png)\n\n![[two.jpeg]]\n\n![c](three.gif)";
    expect(extract_note_image_targets(md)).toEqual([
      "one.png",
      "three.gif",
      "two.jpeg",
    ]);
  });
});
