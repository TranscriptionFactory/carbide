import type { SearchPort } from "$lib/features/search";
import type { VaultStore } from "$lib/features/vault";
import type { LinksStore } from "$lib/features/links/state/links_store.svelte";
import type { VaultId, NoteId, NotePath } from "$lib/shared/types/ids";
import type { MarkdownLspPort } from "$lib/features/markdown_lsp";
import type { MarkdownLspStore } from "$lib/features/markdown_lsp";
import type { NoteMeta } from "$lib/shared/types/note";
import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import { extract_local_links } from "../domain/extract_local_links";

const log = create_logger("links_service");

function uri_to_relative_path(uri: string, vault_path: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURI(uri);
  } catch {
    decoded = uri;
  }
  const prefix = `file://${vault_path}`;
  if (!decoded.startsWith(prefix)) return null;
  let relative = decoded.slice(prefix.length);
  if (relative.startsWith("/")) relative = relative.slice(1);
  return relative;
}

function path_to_note_meta(path: string): NoteMeta {
  const name = path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
  return {
    id: path as NoteId,
    path: path as NotePath,
    name,
    title: name,
    blurb: "",
    mtime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

export class LinksService {
  private active_revision = 0;
  private last_local_note_path: string | null = null;
  private last_local_markdown: string | null = null;

  constructor(
    private readonly search_port: SearchPort,
    private readonly vault_store: VaultStore,
    private readonly links_store: LinksStore,
    private readonly markdown_lsp_port: MarkdownLspPort,
    private readonly markdown_lsp_store: MarkdownLspStore,
  ) {}

  private get_active_vault_id(): VaultId | null {
    return this.vault_store.vault?.id ?? null;
  }

  private is_global_request_stale(revision: number): boolean {
    return revision !== this.active_revision;
  }

  private is_same_local_request(note_path: string, markdown: string): boolean {
    return (
      note_path === this.last_local_note_path &&
      markdown === this.last_local_markdown
    );
  }

  private set_empty_local_snapshot(note_path: string): void {
    this.links_store.set_local_snapshot(note_path, {
      outlink_paths: [],
      external_links: [],
    });
  }

  async load_note_links(note_path: string): Promise<void> {
    const revision = ++this.active_revision;
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      this.links_store.clear();
      return;
    }

    this.links_store.start_global_load(note_path);

    if (this.markdown_lsp_store.status !== "running") {
      this.links_store.set_global_snapshot(note_path, {
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      });
      return;
    }

    const vault_path = this.vault_store.vault?.path ?? "";

    try {
      const locations = await this.markdown_lsp_port.references(
        vault_id,
        note_path,
        0,
        0,
      );
      if (this.is_global_request_stale(revision)) return;

      const seen = new Set<string>();
      const backlinks: NoteMeta[] = [];
      for (const loc of locations) {
        const ref_path = uri_to_relative_path(loc.uri, vault_path);
        if (!ref_path || ref_path === note_path || seen.has(ref_path)) continue;
        seen.add(ref_path);
        backlinks.push(path_to_note_meta(ref_path));
      }

      this.links_store.set_global_snapshot(note_path, {
        backlinks,
        outlinks: [],
        orphan_links: [],
      });
    } catch (error) {
      if (this.is_global_request_stale(revision)) return;
      const message = error_message(error);
      log.error("Failed to load backlinks from markdown LSP", {
        error: message,
      });
      this.links_store.set_global_error(note_path, message);
    }
  }

  update_local_note_links(note_path: string, markdown: string): void {
    if (this.is_same_local_request(note_path, markdown)) {
      return;
    }

    this.last_local_note_path = note_path;
    this.last_local_markdown = markdown;

    try {
      const snapshot = extract_local_links(markdown);
      this.links_store.set_local_snapshot(note_path, snapshot);
    } catch (error) {
      const message = error_message(error);
      log.error("Failed to extract local note links", { error: message });
      this.set_empty_local_snapshot(note_path);
    }
  }

  async load_suggested_links(
    note_path: string,
    limit = 5,
    similarity_threshold = 0.5,
  ): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      this.links_store.clear_suggested_links();
      return;
    }

    this.links_store.start_suggested_links_load(note_path);

    try {
      const hits = await this.search_port.find_similar_notes(
        vault_id,
        note_path,
        limit,
        true,
      );
      if (this.links_store.suggested_links_note_path !== note_path) return;
      const suggested = hits
        .map((hit) => ({ note: hit.note, similarity: 1 - hit.distance }))
        .filter((s) => s.similarity > similarity_threshold);
      this.links_store.set_suggested_links(note_path, suggested);
    } catch (error) {
      if (this.links_store.suggested_links_note_path !== note_path) return;
      const message = error_message(error);
      log.error("Failed to load suggested links", { error: message });
      this.links_store.clear_suggested_links();
    }
  }

  clear_suggested_links() {
    this.links_store.clear_suggested_links();
  }

  clear() {
    this.active_revision += 1;
    this.last_local_note_path = null;
    this.last_local_markdown = null;
    this.links_store.clear();
  }
}
