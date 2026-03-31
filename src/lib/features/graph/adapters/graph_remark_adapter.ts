import type {
  GraphCacheStats,
  GraphNeighborhoodSnapshot,
  GraphPort,
  VaultGraphSnapshot,
} from "$lib/features/graph/ports";
import type { NotesPort } from "$lib/features/note";
import type { VaultId, NotePath } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";
import { extract_local_links } from "$lib/features/links";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("graph_remark_adapter");

const BATCH_CONCURRENCY = 8;

type VaultIndex = {
  vault_id: VaultId;
  notes: Map<string, NoteMeta>;
  outlinks: Map<string, string[]>;
  raw_outlinks: Map<string, string[]>;
  built_at: number;
};

function resolve_wikilink(
  target: string,
  notes: Map<string, NoteMeta>,
): string | null {
  if (notes.has(target)) return target;

  const with_md = target.endsWith(".md") ? target : `${target}.md`;
  if (notes.has(with_md)) return with_md;

  for (const path of notes.keys()) {
    const name = path.split("/").pop() ?? "";
    if (name === target || name === with_md) return path;
    const stem = name.replace(/\.md$/, "");
    if (stem === target) return path;
  }
  return null;
}

async function build_vault_index(
  notes_port: NotesPort,
  vault_id: VaultId,
  read_raw: (vault_id: VaultId, path: string) => Promise<string>,
): Promise<VaultIndex> {
  const all_notes = await notes_port.list_notes(vault_id);
  const notes = new Map<string, NoteMeta>();
  for (const meta of all_notes) {
    notes.set(meta.path, meta);
  }

  const outlinks = new Map<string, string[]>();
  const raw_outlinks = new Map<string, string[]>();
  const unreadable_note_paths: string[] = [];

  for (let i = 0; i < all_notes.length; i += BATCH_CONCURRENCY) {
    const batch = all_notes.slice(i, i + BATCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map((meta) =>
        read_raw(vault_id, meta.path)
          .then((markdown) => ({ path: meta.path, markdown }))
          .catch((error) => {
            unreadable_note_paths.push(meta.path);
            log.warn("Skipping unreadable graph note", {
              note_path: meta.path,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          }),
      ),
    );

    for (const result of results) {
      if (!result) continue;
      const { outlink_paths } = extract_local_links(result.markdown);
      raw_outlinks.set(result.path, outlink_paths);
      const resolved = outlink_paths
        .map((p) => resolve_wikilink(p, notes))
        .filter((p): p is string => p !== null);
      outlinks.set(result.path, resolved);
    }
  }

  log.info("Vault index built", {
    notes: notes.size,
    links: [...outlinks.values()].reduce((sum, arr) => sum + arr.length, 0),
    unreadable_notes: unreadable_note_paths.length,
  });

  return { vault_id, notes, outlinks, raw_outlinks, built_at: Date.now() };
}

export function create_graph_remark_adapter(
  notes_port: NotesPort,
  read_raw: (vault_id: VaultId, path: string) => Promise<string>,
): GraphPort {
  let cached_index: VaultIndex | null = null;

  async function get_index(vault_id: VaultId): Promise<VaultIndex> {
    if (cached_index?.vault_id === vault_id) return cached_index;
    cached_index = await build_vault_index(notes_port, vault_id, read_raw);
    return cached_index;
  }

  return {
    async load_note_neighborhood(
      vault_id: VaultId,
      note_path: string,
    ): Promise<GraphNeighborhoodSnapshot> {
      const index = await get_index(vault_id);
      const center_meta = index.notes.get(note_path);
      if (!center_meta) {
        throw new Error(`Note not found: ${note_path}`);
      }

      const outlink_paths = index.outlinks.get(note_path) ?? [];
      const outlinks: NoteMeta[] = [];
      for (const path of outlink_paths) {
        const meta = index.notes.get(path);
        if (meta) outlinks.push(meta);
      }

      const backlinks: NoteMeta[] = [];
      const orphan_counts = new Map<string, number>();

      for (const [source, targets] of index.outlinks) {
        if (source === note_path) continue;
        if (targets.includes(note_path)) {
          const meta = index.notes.get(source);
          if (meta) backlinks.push(meta);
        }
      }

      const raw_targets = index.raw_outlinks.get(note_path) ?? [];
      for (const target of raw_targets) {
        const resolved = resolve_wikilink(target, index.notes);
        if (!resolved) {
          orphan_counts.set(target, (orphan_counts.get(target) ?? 0) + 1);
        }
      }

      const orphan_links = [...orphan_counts.entries()].map(
        ([target_path, ref_count]) => ({ target_path, ref_count }),
      );

      const bidirectional = outlinks.filter((o) =>
        (index.outlinks.get(o.path) ?? []).includes(note_path),
      );

      return {
        center: center_meta,
        backlinks,
        outlinks,
        orphan_links,
        stats: {
          node_count: 1 + backlinks.length + outlinks.length,
          edge_count: outlink_paths.length + backlinks.length,
          backlink_count: backlinks.length,
          outlink_count: outlinks.length,
          orphan_count: orphan_links.length,
          bidirectional_count: bidirectional.length,
        },
      };
    },

    async load_vault_graph(vault_id: VaultId): Promise<VaultGraphSnapshot> {
      const index = await get_index(vault_id);

      const nodes = [...index.notes.values()].map((meta) => ({
        path: meta.path,
        title: meta.title || meta.name,
      }));

      const edge_set = new Set<string>();
      const edges: { source: string; target: string }[] = [];

      for (const [source, targets] of index.outlinks) {
        for (const target of targets) {
          if (!index.notes.has(target)) continue;
          const key = `${source}\0${target}`;
          if (!edge_set.has(key)) {
            edge_set.add(key);
            edges.push({ source, target });
          }
        }
      }

      return {
        nodes,
        edges,
        stats: {
          node_count: nodes.length,
          edge_count: edges.length,
        },
      };
    },

    async invalidate_cache(
      _vault_id: VaultId,
      _note_id?: string,
    ): Promise<void> {
      cached_index = null;
    },

    async cache_stats(): Promise<GraphCacheStats> {
      return {
        size: cached_index ? 1 : 0,
        hits: 0,
        misses: 0,
        insertions: 0,
        evictions: 0,
        hit_rate: 0,
      };
    },
  };
}
