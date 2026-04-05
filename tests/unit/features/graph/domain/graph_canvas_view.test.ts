import { describe, it, expect } from "vitest";
import { resolve_graph_canvas_view } from "$lib/features/graph/domain/graph_canvas_view";
import type { GraphNeighborhoodSnapshot } from "$lib/features/graph/ports";
import type { NoteId, NotePath } from "$lib/shared/types/ids";

describe("resolve_graph_canvas_view", () => {
  const mock_snapshot: GraphNeighborhoodSnapshot = {
    center: {
      id: "id-center" as NoteId,
      path: "center.md" as NotePath,
      title: "Center",
      name: "center",
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
    },
    backlinks: [
      {
        id: "id-back" as NoteId,
        path: "back.md" as NotePath,
        title: "Backlink",
        name: "back",
        blurb: "",
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 0,
        file_type: null,
      },
    ],
    outlinks: [
      {
        id: "id-out" as NoteId,
        path: "out.md" as NotePath,
        title: "Outlink",
        name: "out",
        blurb: "",
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 0,
        file_type: null,
      },
      {
        id: "id-both" as NoteId,
        path: "both.md" as NotePath,
        title: "Both",
        name: "both",
        blurb: "",
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 0,
        file_type: null,
      },
    ],
    orphan_links: [
      {
        target_path: "orphan.md",
        ref_count: 1,
      },
    ],
    stats: {
      node_count: 5,
      edge_count: 5,
      backlink_count: 1,
      outlink_count: 2,
      orphan_count: 1,
      bidirectional_count: 0,
    },
  };

  // Add bidirectional to backlinks to test deduplication
  mock_snapshot.backlinks.push({
    id: "id-both" as NoteId,
    path: "both.md" as NotePath,
    title: "Both",
    name: "both",
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  });

  it("builds a layout with center, backlinks, outlinks, both and orphans", () => {
    const view = resolve_graph_canvas_view({
      snapshot: mock_snapshot,
      filter_query: "",
      selected_node_ids: ["center.md"],
      hovered_node_id: "back.md",
    });

    expect(view.nodes).toHaveLength(5); // center, back, out, both, orphan

    const center_node = view.nodes.find((n) => n.kind === "center");
    expect(center_node?.path).toBe("center.md");
    expect(center_node?.selected).toBe(true);

    const back_node = view.nodes.find((n) => n.kind === "backlink");
    expect(back_node?.hovered).toBe(true);

    const both_node = view.nodes.find((n) => n.kind === "both");
    expect(both_node?.path).toBe("both.md");

    const orphan_node = view.nodes.find((n) => n.kind === "orphan");
    expect(orphan_node?.path).toBe("orphan.md");
    expect(orphan_node?.existing).toBe(false);

    expect(view.edges).toHaveLength(4); // from center to others
  });

  it("applies filter query", () => {
    const view = resolve_graph_canvas_view({
      snapshot: mock_snapshot,
      filter_query: "back",
      selected_node_ids: [],
      hovered_node_id: null,
    });

    // Should contain center and the node matching 'back'
    expect(view.nodes).toHaveLength(2);
    expect(view.nodes.map((n) => n.label)).toContain("Center");
    expect(view.nodes.map((n) => n.label)).toContain("Backlink");
  });

  it("centers nodes based on container_width", () => {
    const wide_view = resolve_graph_canvas_view({
      snapshot: mock_snapshot,
      filter_query: "",
      selected_node_ids: [],
      hovered_node_id: null,
      container_width: 800,
    });

    const narrow_view = resolve_graph_canvas_view({
      snapshot: mock_snapshot,
      filter_query: "",
      selected_node_ids: [],
      hovered_node_id: null,
      container_width: 400,
    });

    const wide_center = wide_view.nodes.find((n) => n.kind === "center");
    const narrow_center = narrow_view.nodes.find((n) => n.kind === "center");

    // NODE_WIDTH is 176
    // CENTER_X = floor((800 - 176) / 2) = 312
    // CENTER_X = floor((400 - 176) / 2) = 112
    expect(wide_center?.x).toBe(312);
    expect(narrow_center?.x).toBe(112);

    // Right nodes should also adapt
    const wide_out = wide_view.nodes.find((n) => n.kind === "outlink");
    const narrow_out = narrow_view.nodes.find((n) => n.kind === "outlink");

    // RIGHT_X = 800 - 176 - 24 = 600
    // RIGHT_X = 400 - 176 - 24 = 200
    expect(wide_out?.x).toBe(600);
    expect(narrow_out?.x).toBe(200);
  });
});
