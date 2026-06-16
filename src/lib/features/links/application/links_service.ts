import type { NoteLinksSnapshot, SearchPort } from "$lib/features/search";
import type { VaultStore } from "$lib/features/vault";
import type { LinksStore } from "$lib/features/links/state/links_store.svelte";
import type { VaultId } from "$lib/shared/types/ids";
import type { MarkdownLspPort } from "$lib/features/markdown_lsp";
import type { MarkdownLspStore } from "$lib/features/markdown_lsp";
import type { TagPort } from "$lib/features/tags";
import type { NoteService } from "$lib/features/note";
import type { TabStore } from "$lib/features/tab";
import type { NoteMeta } from "$lib/shared/types/note";
import type { NoteSearchHit } from "$lib/shared/types/search";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import { extract_local_links } from "../domain/extract_local_links";
import {
  merge_suggestions,
  path_to_note_meta,
} from "../domain/merge_suggestions";
import {
  collect_shared_tag_notes,
  filter_unlinked_mentions,
} from "../domain/related_context";
import { link_mentions } from "../domain/link_mention";

const log = create_logger("links_service");

function note_title_from_path(note_path: string): string {
  const leaf = note_path.split("/").pop() ?? note_path;
  return leaf.replace(/\.md$/i, "").trim();
}

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
    private readonly tag_port?: TagPort,
    private readonly note_service?: NoteService,
    private readonly tab_store?: TabStore,
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
      attachment_paths: [],
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

    const vault_path = this.vault_store.vault?.path ?? "";

    let db_snapshot: NoteLinksSnapshot | null = null;
    try {
      db_snapshot = await this.search_port.get_note_links_snapshot(
        vault_id,
        note_path,
      );
    } catch (error) {
      log.warn("Failed to load links snapshot from search DB", {
        error: error_message(error),
      });
    }

    if (this.markdown_lsp_store.status !== "running") {
      this.links_store.set_global_snapshot(note_path, {
        backlinks: db_snapshot?.backlinks ?? [],
        outlinks: db_snapshot?.outlinks ?? [],
        orphan_links: db_snapshot?.orphan_links ?? [],
        attachments: db_snapshot?.attachments ?? [],
      });
      return;
    }

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

      if (db_snapshot) {
        for (const bl of db_snapshot.backlinks) {
          if (!seen.has(bl.path)) {
            seen.add(bl.path);
            backlinks.push(bl);
          }
        }
      }

      this.links_store.set_global_snapshot(note_path, {
        backlinks,
        outlinks: db_snapshot?.outlinks ?? [],
        orphan_links: db_snapshot?.orphan_links ?? [],
        attachments: db_snapshot?.attachments ?? [],
      });
    } catch (error) {
      if (this.is_global_request_stale(revision)) return;
      const message = error_message(error);
      log.error("Failed to load backlinks from markdown LSP", {
        error: message,
      });
      this.links_store.set_global_snapshot(note_path, {
        backlinks: db_snapshot?.backlinks ?? [],
        outlinks: db_snapshot?.outlinks ?? [],
        orphan_links: db_snapshot?.orphan_links ?? [],
        attachments: db_snapshot?.attachments ?? [],
      });
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
      const [semantic_hits, smart_suggestions] = await Promise.allSettled([
        this.search_port.find_similar_notes(vault_id, note_path, limit, true),
        this.search_port.compute_smart_link_suggestions(
          vault_id,
          note_path,
          limit,
        ),
      ]);
      if (this.links_store.suggested_links_note_path !== note_path) return;

      const suggested = merge_suggestions(
        semantic_hits.status === "fulfilled" ? semantic_hits.value : [],
        smart_suggestions.status === "fulfilled" ? smart_suggestions.value : [],
        similarity_threshold,
        limit,
      );

      if (semantic_hits.status === "rejected") {
        log.error("Failed to load semantic suggestions", {
          error: error_message(semantic_hits.reason),
        });
      }
      if (smart_suggestions.status === "rejected") {
        log.error("Failed to load smart link suggestions", {
          error: error_message(smart_suggestions.reason),
        });
      }

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

  async load_related_context(
    note_path: string,
    tags: string[],
    limit = 8,
  ): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      this.links_store.clear_related();
      return;
    }

    this.links_store.start_related_load(note_path);

    const title = note_title_from_path(note_path);
    const linked = new Set<string>([
      note_path,
      ...this.links_store.backlinks.map((n) => n.path),
      ...this.links_store.outlinks.map((n) => n.path),
    ]);

    const [tag_paths, mentions] = await Promise.allSettled([
      this.load_shared_tag_paths(vault_id, tags),
      title
        ? this.search_port.search_notes(
            vault_id,
            { raw: title, text: title, scope: "content", domain: "notes" },
            limit * 2,
          )
        : Promise.resolve<NoteSearchHit[]>([]),
    ]);

    if (this.links_store.related_note_path !== note_path) return;

    if (tag_paths.status === "rejected") {
      log.error("Failed to load shared-tag notes", {
        error: error_message(tag_paths.reason),
      });
    }
    if (mentions.status === "rejected") {
      log.error("Failed to load unlinked mentions", {
        error: error_message(mentions.reason),
      });
    }

    const shared_tag = collect_shared_tag_notes(
      tag_paths.status === "fulfilled" ? tag_paths.value : [],
      linked,
      limit,
    );
    const unlinked = filter_unlinked_mentions(
      mentions.status === "fulfilled" ? mentions.value : [],
      new Set([...linked, ...shared_tag.map((n) => n.path)]),
      limit,
    );

    this.links_store.set_related(note_path, { shared_tag, unlinked });
  }

  private async load_shared_tag_paths(
    vault_id: VaultId,
    tags: string[],
  ): Promise<string[]> {
    const tag_port = this.tag_port;
    if (!tag_port || tags.length === 0) return [];
    const results = await Promise.all(
      tags.map((tag) => tag_port.get_notes_for_tag(vault_id, tag)),
    );
    return results.flat();
  }

  clear_related() {
    this.links_store.clear_related();
  }

  async link_mention(mention_path: string, title: string): Promise<boolean> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id || !this.note_service) return false;

    const note_path = as_note_path(mention_path);
    try {
      const doc = await this.note_service.read_note(vault_id, note_path);
      const { markdown, changed } = link_mentions(doc.markdown, title);
      if (!changed) {
        this.links_store.remove_unlinked_mention(mention_path);
        return false;
      }

      await this.note_service.write_note_indexed(
        vault_id,
        note_path,
        as_markdown_text(markdown),
      );
      this.tab_store?.invalidate_cache_by_path(note_path);
      this.links_store.remove_unlinked_mention(mention_path);
      return true;
    } catch (error) {
      log.error("Failed to link unlinked mention", {
        mention_path,
        error: error_message(error),
      });
      return false;
    }
  }

  clear() {
    this.active_revision += 1;
    this.last_local_note_path = null;
    this.last_local_markdown = null;
    this.links_store.clear();
  }
}
