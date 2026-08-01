import { describe, expect, it } from "vitest";
import { create_epub_image_collector } from "$lib/features/document/domain/note_epub";
import { resolve_note_asset_path } from "$lib/features/document/domain/note_export_assets";

describe("resolve_note_asset_path", () => {
  it("resolves a canonical src relative to the note", () => {
    expect(
      resolve_note_asset_path(
        "notes/deep/note.md",
        ".assets/pic.png",
        "canonical",
      ),
    ).toBe("notes/deep/.assets/pic.png");
  });

  it("decodes percent-escaped sources", () => {
    expect(
      resolve_note_asset_path("note.md", ".assets/my%20pic.png", "canonical"),
    ).toBe(".assets/my pic.png");
  });

  it("treats a wiki embed target as already vault-relative", () => {
    expect(
      resolve_note_asset_path("notes/deep/note.md", ".assets/pic.png", "wiki"),
    ).toBe(".assets/pic.png");
  });

  it("has no vault asset for remote or absolute sources", () => {
    expect(
      resolve_note_asset_path("note.md", "https://x.test/a.png", "canonical"),
    ).toBeNull();
    expect(
      resolve_note_asset_path(
        "note.md",
        "data:image/png;base64,AAA",
        "canonical",
      ),
    ).toBeNull();
    expect(
      resolve_note_asset_path("note.md", "/tmp/a.png", "canonical"),
    ).toBeNull();
    expect(
      resolve_note_asset_path("note.md", "HTTP://x.test/a.png", "canonical"),
    ).toBeNull();
  });
});

describe("create_epub_image_collector", () => {
  it("registers each asset under a numbered href and returns it as the img src", async () => {
    const collector = create_epub_image_collector((src) => src);

    expect(await collector.image_resolver(".assets/a.png", "canonical")).toBe(
      "images/img-0.png",
    );
    expect(await collector.image_resolver(".assets/b.JPG", "canonical")).toBe(
      "images/img-1.jpg",
    );

    expect(collector.images).toEqual([
      {
        href: "images/img-0.png",
        asset_path: ".assets/a.png",
        media_type: "image/png",
      },
      {
        href: "images/img-1.jpg",
        asset_path: ".assets/b.JPG",
        media_type: "image/jpeg",
      },
    ]);
  });

  it("reuses one href when the same asset appears twice", async () => {
    const collector = create_epub_image_collector((src) => src);

    const first = await collector.image_resolver(".assets/a.png", "canonical");
    const second = await collector.image_resolver(".assets/a.png", "canonical");

    expect(second).toBe(first);
    expect(collector.images).toHaveLength(1);
  });

  it("skips sources the resolver cannot map to a vault asset", async () => {
    const collector = create_epub_image_collector(() => null);

    expect(
      await collector.image_resolver("https://x.test/a.png", "canonical"),
    ).toBeNull();
    expect(collector.images).toEqual([]);
  });

  it("falls back to an octet-stream media type for unknown extensions", async () => {
    const collector = create_epub_image_collector((src) => src);

    await collector.image_resolver(".assets/weird.tiff", "canonical");

    expect(collector.images[0]?.media_type).toBe("application/octet-stream");
  });
});
