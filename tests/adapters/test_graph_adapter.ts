import type {
  GraphPort,
  GraphNeighborhoodSnapshot,
} from "$lib/features/graph/ports";
import type { NoteId, NotePath } from "$lib/shared/types/ids";

export function create_test_graph_adapter(): GraphPort {
  return {
    load_note_neighborhood: (vault_id, note_path) =>
      Promise.resolve({
        center: {
          id: "test-id" as NoteId,
          path: note_path as NotePath,
          title: "Test",
          name: "test",
          mtime_ms: 0,
          size_bytes: 0,
        },
        backlinks: [],
        outlinks: [],
        orphan_links: [],
        stats: {
          node_count: 1,
          edge_count: 0,
          backlink_count: 0,
          outlink_count: 0,
          orphan_count: 0,
          bidirectional_count: 0,
        },
      } as GraphNeighborhoodSnapshot),
  };
}
