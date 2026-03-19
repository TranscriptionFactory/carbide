import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  detect_embed_type,
  parse_embed_fragment,
} from "$lib/features/editor/adapters/file_embed_plugin";

describe("detect_embed_type", () => {
  it("detects pdf", () => {
    expect(detect_embed_type("report.pdf")).toBe("pdf");
    expect(detect_embed_type("path/to/file.PDF")).toBe("pdf");
  });

  it("detects audio formats", () => {
    expect(detect_embed_type("song.mp3")).toBe("audio");
    expect(detect_embed_type("clip.wav")).toBe("audio");
    expect(detect_embed_type("track.m4a")).toBe("audio");
    expect(detect_embed_type("music.ogg")).toBe("audio");
    expect(detect_embed_type("lossless.flac")).toBe("audio");
  });

  it("detects video formats", () => {
    expect(detect_embed_type("movie.mp4")).toBe("video");
    expect(detect_embed_type("clip.webm")).toBe("video");
    expect(detect_embed_type("vid.ogv")).toBe("video");
    expect(detect_embed_type("film.mkv")).toBe("video");
  });

  it("returns unknown for unrecognized extensions", () => {
    expect(detect_embed_type("file.txt")).toBe("unknown");
    expect(detect_embed_type("doc.docx")).toBe("unknown");
  });
});

describe("parse_embed_fragment", () => {
  it("parses empty fragment", () => {
    expect(parse_embed_fragment("")).toEqual({ page: null, height: null });
  });

  it("parses page parameter", () => {
    expect(parse_embed_fragment("#page=3")).toEqual({ page: 3, height: null });
  });

  it("parses height parameter", () => {
    expect(parse_embed_fragment("#height=500")).toEqual({
      page: null,
      height: 500,
    });
  });

  it("parses combined parameters", () => {
    expect(parse_embed_fragment("#page=2&height=600")).toEqual({
      page: 2,
      height: 600,
    });
  });
});

describe("file_embed schema", () => {
  it("file_embed node exists in schema", () => {
    expect(schema.nodes["file_embed"]).toBeTruthy();
  });

  it("creates a file_embed node with default attrs", () => {
    const node = schema.nodes["file_embed"]!.create({ src: "report.pdf" });
    expect(node.type.name).toBe("file_embed");
    expect(node.attrs["src"]).toBe("report.pdf");
    expect(node.attrs["page"]).toBeNull();
    expect(node.attrs["height"]).toBe(400);
    expect(node.attrs["file_type"]).toBe("");
  });

  it("creates a file_embed node with all attrs", () => {
    const node = schema.nodes["file_embed"]!.create({
      src: "report.pdf",
      page: 5,
      height: 600,
      file_type: "pdf",
    });
    expect(node.attrs["page"]).toBe(5);
    expect(node.attrs["height"]).toBe(600);
    expect(node.attrs["file_type"]).toBe("pdf");
  });
});

describe("file_embed serialization", () => {
  it("serializes file_embed with default attrs", () => {
    const doc = schema.node("doc", null, [
      schema.nodes["file_embed"]!.create({
        src: "report.pdf",
        file_type: "pdf",
      }),
    ]);
    const md = serialize_markdown(doc);
    expect(md.trim()).toBe("![[report.pdf]]");
  });

  it("serializes file_embed with page", () => {
    const doc = schema.node("doc", null, [
      schema.nodes["file_embed"]!.create({
        src: "report.pdf",
        page: 3,
        file_type: "pdf",
      }),
    ]);
    const md = serialize_markdown(doc);
    expect(md.trim()).toBe("![[report.pdf#page=3]]");
  });

  it("serializes file_embed with custom height", () => {
    const doc = schema.node("doc", null, [
      schema.nodes["file_embed"]!.create({
        src: "report.pdf",
        height: 600,
        file_type: "pdf",
      }),
    ]);
    const md = serialize_markdown(doc);
    expect(md.trim()).toBe("![[report.pdf#height=600]]");
  });

  it("serializes file_embed with page and height", () => {
    const doc = schema.node("doc", null, [
      schema.nodes["file_embed"]!.create({
        src: "report.pdf",
        page: 2,
        height: 500,
        file_type: "pdf",
      }),
    ]);
    const md = serialize_markdown(doc);
    expect(md.trim()).toBe("![[report.pdf#page=2&height=500]]");
  });

  it("serializes audio embed", () => {
    const doc = schema.node("doc", null, [
      schema.nodes["file_embed"]!.create({
        src: "song.mp3",
        file_type: "audio",
      }),
    ]);
    const md = serialize_markdown(doc);
    expect(md.trim()).toBe("![[song.mp3]]");
  });

  it("serializes video embed", () => {
    const doc = schema.node("doc", null, [
      schema.nodes["file_embed"]!.create({
        src: "clip.mp4",
        file_type: "video",
      }),
    ]);
    const md = serialize_markdown(doc);
    expect(md.trim()).toBe("![[clip.mp4]]");
  });
});

describe("file_embed does not conflict with excalidraw_embed", () => {
  it("excalidraw_embed still exists in schema", () => {
    expect(schema.nodes["excalidraw_embed"]).toBeTruthy();
  });

  it("excalidraw embed serializes correctly", () => {
    const doc = schema.node("doc", null, [
      schema.nodes["excalidraw_embed"]!.create({ src: "drawing.excalidraw" }),
    ]);
    const md = serialize_markdown(doc);
    expect(md.trim()).toBe("![[drawing.excalidraw]]");
  });
});
