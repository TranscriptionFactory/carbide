import { describe, it, expect, vi } from "vitest";
import {
  parse_canvas,
  serialize_canvas,
} from "$lib/features/canvas/domain/canvas_parser";

describe("parse_canvas", () => {
  it("parses a valid canvas with all node types", () => {
    const json = JSON.stringify({
      nodes: [
        {
          id: "1",
          type: "text",
          text: "Hello",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
        },
        {
          id: "2",
          type: "file",
          file: "notes/foo.md",
          x: 300,
          y: 0,
          width: 200,
          height: 100,
        },
        {
          id: "3",
          type: "link",
          url: "https://example.com",
          x: 0,
          y: 200,
          width: 200,
          height: 100,
        },
        {
          id: "4",
          type: "group",
          label: "Group 1",
          x: 0,
          y: 400,
          width: 400,
          height: 300,
        },
      ],
      edges: [
        {
          id: "e1",
          fromNode: "1",
          toNode: "2",
          fromSide: "right",
          toSide: "left",
        },
      ],
    });

    const result = parse_canvas(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toHaveLength(4);
    expect(result.data.edges).toHaveLength(1);
    expect(result.data.nodes[0]!.type).toBe("text");
    expect(result.data.nodes[1]!.type).toBe("file");
    expect(result.data.nodes[2]!.type).toBe("link");
    expect(result.data.nodes[3]!.type).toBe("group");
  });

  it("rejects invalid JSON", () => {
    const result = parse_canvas("not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Invalid JSON");
  });

  it("rejects non-object JSON", () => {
    const result = parse_canvas("[1, 2, 3]");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Canvas must be a JSON object");
  });

  it("rejects missing nodes array", () => {
    const result = parse_canvas('{"edges": []}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Missing or invalid 'nodes' array");
  });

  it("rejects missing edges array", () => {
    const result = parse_canvas('{"nodes": []}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Missing or invalid 'edges' array");
  });

  it("skips nodes with missing required fields", () => {
    const json = JSON.stringify({
      nodes: [
        {
          id: "1",
          type: "text",
          text: "Good",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
        },
        { id: "2", type: "text" },
      ],
      edges: [],
    });

    const result = parse_canvas(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toHaveLength(1);
  });

  it("skips edges with missing required fields", () => {
    const json = JSON.stringify({
      nodes: [],
      edges: [
        { id: "e1", fromNode: "1", toNode: "2" },
        { id: "e2", fromNode: "1" },
      ],
    });

    const result = parse_canvas(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.edges).toHaveLength(1);
  });

  it("preserves unknown fields on round-trip", () => {
    const original = {
      nodes: [
        {
          id: "1",
          type: "text",
          text: "Hello",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          customField: "keep",
        },
      ],
      edges: [],
      version: "1.0",
      customTopLevel: true,
    };

    const result = parse_canvas(JSON.stringify(original));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.version).toBe("1.0");
    expect(result.data.customTopLevel).toBe(true);
    expect((result.data.nodes[0] as any).customField).toBe("keep");

    const serialized = serialize_canvas(result.data);
    const reparsed = JSON.parse(serialized);
    expect(reparsed.version).toBe("1.0");
    expect(reparsed.customTopLevel).toBe(true);
    expect(reparsed.nodes[0].customField).toBe("keep");
  });

  it("converts unknown node types to placeholder text nodes with warning", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const json = JSON.stringify({
      nodes: [
        { id: "1", type: "custom-widget", x: 0, y: 0, width: 100, height: 50 },
      ],
      edges: [],
    });

    const result = parse_canvas(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toHaveLength(1);
    expect(result.data.nodes[0]!.type).toBe("text");

    // Logger dispatches through an async microtask; flush before asserting
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("custom-widget"));

    spy.mockRestore();
  });

  it("rejects edges with invalid side values", () => {
    const json = JSON.stringify({
      nodes: [],
      edges: [{ id: "e1", fromNode: "1", toNode: "2", fromSide: "invalid" }],
    });

    const result = parse_canvas(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.edges).toHaveLength(0);
  });
});

describe("serialize_canvas", () => {
  it("produces valid JSON with tab indentation", () => {
    const data = {
      nodes: [
        {
          id: "1",
          type: "text" as const,
          text: "Hello",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
        },
      ],
      edges: [],
    };

    const json = serialize_canvas(data);
    expect(json).toContain("\t");
    const parsed = JSON.parse(json);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.edges).toHaveLength(0);
  });

  it("round-trips an empty canvas", () => {
    const empty = { nodes: [], edges: [] };
    const json = serialize_canvas(empty);
    const result = parse_canvas(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toHaveLength(0);
    expect(result.data.edges).toHaveLength(0);
  });
});
