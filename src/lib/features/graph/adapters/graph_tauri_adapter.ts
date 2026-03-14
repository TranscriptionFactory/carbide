import type {
  GraphCacheStats,
  GraphNeighborhoodSnapshot,
  GraphPort,
} from "$lib/features/graph/ports";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type { NoteId, NotePath, VaultId } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";

type TauriNoteMeta = {
  id: string;
  path: string;
  title: string;
  name: string;
  mtime_ms: number;
  size_bytes: number;
};

type TauriGraphNeighborhoodSnapshot = {
  center: TauriNoteMeta;
  backlinks: TauriNoteMeta[];
  outlinks: TauriNoteMeta[];
  orphan_links: {
    target_path: string;
    ref_count: number;
  }[];
  stats: GraphNeighborhoodSnapshot["stats"];
};

function to_note_meta(note: TauriNoteMeta): NoteMeta {
  return {
    id: note.id as NoteId,
    path: note.path as NotePath,
    title: note.title,
    name: note.name,
    mtime_ms: note.mtime_ms,
    size_bytes: note.size_bytes,
  };
}

export function create_graph_tauri_adapter(): GraphPort {
  return {
    async load_note_neighborhood(
      vault_id: VaultId,
      note_path: string,
    ): Promise<GraphNeighborhoodSnapshot> {
      const snapshot = await tauri_invoke<TauriGraphNeighborhoodSnapshot>(
        "graph_load_note_neighborhood",
        {
          vaultId: vault_id,
          noteId: note_path,
        },
      );

      return {
        center: to_note_meta(snapshot.center),
        backlinks: snapshot.backlinks.map(to_note_meta),
        outlinks: snapshot.outlinks.map(to_note_meta),
        orphan_links: snapshot.orphan_links.map((entry) => ({
          target_path: entry.target_path,
          ref_count: entry.ref_count,
        })),
        stats: snapshot.stats,
      };
    },

    async invalidate_cache(vault_id: VaultId, note_id?: string): Promise<void> {
      await tauri_invoke("graph_invalidate_cache", {
        vaultId: vault_id,
        noteId: note_id ?? null,
      });
    },

    async cache_stats(): Promise<GraphCacheStats> {
      return tauri_invoke<GraphCacheStats>("graph_cache_stats", {});
    },
  };
}
