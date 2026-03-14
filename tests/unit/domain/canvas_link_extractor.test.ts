import { describe, it, expect } from "vitest";
import {
  extract_canvas_links,
  rewrite_canvas_file_refs,
} from "$lib/features/canvas/domain/canvas_link_extractor";
import type { CanvasData } from "$lib/features/canvas/types/canvas";

function make_canvas(nodes: CanvasData["nodes"]): CanvasData {
  return { nodes, edges: [] };
}

describe("extract_canvas_links", () => {
  it("extracts file refs from file nodes", () => {
    const data = make_canvas([
      {
        id: "1",
        type: "file",
        file: "notes/foo.md",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      },
      {
        id: "2",
        type: "file",
        file: "notes/bar.md",
        x: 0,
        y: 200,
        width: 200,
        height: 100,
      },
    ]);

    const links = extract_canvas_links(data);
    expect(links.file_refs).toEqual(["notes/bar.md", "notes/foo.md"]);
  });

  it("extracts wiki links from text nodes", () => {
    const data = make_canvas([
      {
        id: "1",
        type: "text",
        text: "See [[My Note]] and [[Other#heading]]",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      },
    ]);

    const links = extract_canvas_links(data);
    expect(links.wiki_links).toEqual(["My Note", "Other"]);
  });

  it("handles wiki links with aliases", () => {
    const data = make_canvas([
      {
        id: "1",
        type: "text",
        text: "[[Real Note|Display Text]]",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      },
    ]);

    const links = extract_canvas_links(data);
    expect(links.wiki_links).toEqual(["Real Note"]);
  });

  it("deduplicates file refs", () => {
    const data = make_canvas([
      {
        id: "1",
        type: "file",
        file: "notes/foo.md",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      },
      {
        id: "2",
        type: "file",
        file: "notes/foo.md",
        x: 0,
        y: 200,
        width: 200,
        height: 100,
      },
    ]);

    const links = extract_canvas_links(data);
    expect(links.file_refs).toHaveLength(1);
  });

  it("returns empty for canvas with no links", () => {
    const data = make_canvas([
      {
        id: "1",
        type: "text",
        text: "Just plain text",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      },
      {
        id: "2",
        type: "link",
        url: "https://example.com",
        x: 0,
        y: 200,
        width: 200,
        height: 100,
      },
    ]);

    const links = extract_canvas_links(data);
    expect(links.file_refs).toHaveLength(0);
    expect(links.wiki_links).toHaveLength(0);
  });
});

describe("rewrite_canvas_file_refs", () => {
  it("rewrites file node references", () => {
    const data = make_canvas([
      {
        id: "1",
        type: "file",
        file: "notes/old-name.md",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      },
      {
        id: "2",
        type: "file",
        file: "notes/other.md",
        x: 0,
        y: 200,
        width: 200,
        height: 100,
      },
    ]);

    const result = rewrite_canvas_file_refs(
      data,
      "notes/old-name.md",
      "notes/new-name.md",
    );
    expect(result.changed).toBe(true);
    expect(
      result.data.nodes[0]!.type === "file" && result.data.nodes[0]!.file,
    ).toBe("notes/new-name.md");
    expect(
      result.data.nodes[1]!.type === "file" && result.data.nodes[1]!.file,
    ).toBe("notes/other.md");
  });

  it("rewrites wiki links in text nodes", () => {
    const data = make_canvas([
      {
        id: "1",
        type: "text",
        text: "See [[old-name]] for details",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      },
    ]);

    const result = rewrite_canvas_file_refs(
      data,
      "notes/old-name.md",
      "notes/new-name.md",
    );
    expect(result.changed).toBe(true);
    expect(
      result.data.nodes[0]!.type === "text" && result.data.nodes[0]!.text,
    ).toBe("See [[new-name]] for details");
  });

  it("returns unchanged when no matches", () => {
    const data = make_canvas([
      {
        id: "1",
        type: "file",
        file: "notes/unrelated.md",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      },
    ]);

    const result = rewrite_canvas_file_refs(
      data,
      "notes/old-name.md",
      "notes/new-name.md",
    );
    expect(result.changed).toBe(false);
  });
});
