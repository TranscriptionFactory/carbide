import type { NoteMeta } from "$lib/shared/types/note";
import type { OrphanLink } from "$lib/shared/types/search";
import type {
  AttachmentLink,
  ExternalLink,
} from "$lib/features/links/types/link";
import type { SmartLinkRuleMatch } from "$lib/features/smart_links";

export type SuggestedLink = {
  note: NoteMeta;
  similarity: number;
  rules?: SmartLinkRuleMatch[];
};

type LinksSnapshot = {
  backlinks: NoteMeta[];
  outlinks: NoteMeta[];
  orphan_links: OrphanLink[];
  attachments: AttachmentLink[];
};

type LocalLinksSnapshot = {
  outlink_paths: string[];
  attachment_paths: string[];
  external_links: ExternalLink[];
};

export type LinksGlobalStatus = "idle" | "loading" | "ready" | "error";

export class LinksStore {
  local_outlink_paths = $state<string[]>([]);
  local_attachment_paths = $state<string[]>([]);
  external_links = $state<ExternalLink[]>([]);

  backlinks = $state<NoteMeta[]>([]);
  outlinks = $state<NoteMeta[]>([]);
  orphan_links = $state<OrphanLink[]>([]);
  attachments = $state<AttachmentLink[]>([]);
  active_note_path = $state<string | null>(null);
  global_status = $state<LinksGlobalStatus>("idle");
  global_error = $state<string | null>(null);

  suggested_links = $state<SuggestedLink[]>([]);
  suggested_links_loading = $state(false);
  suggested_links_note_path = $state<string | null>(null);

  related_shared_tag = $state<NoteMeta[]>([]);
  related_unlinked = $state<NoteMeta[]>([]);
  related_loading = $state(false);
  related_note_path = $state<string | null>(null);

  set_local_snapshot(note_path: string, snapshot: LocalLinksSnapshot) {
    this.active_note_path = note_path;
    this.local_outlink_paths = snapshot.outlink_paths;
    this.local_attachment_paths = snapshot.attachment_paths;
    this.external_links = snapshot.external_links;
  }

  start_global_load(note_path: string) {
    this.active_note_path = note_path;
    this.global_status = "loading";
    this.global_error = null;
    this.backlinks = [];
    this.outlinks = [];
    this.orphan_links = [];
    this.attachments = [];
  }

  set_snapshot(note_path: string, snapshot: LinksSnapshot) {
    this.set_global_snapshot(note_path, snapshot);
  }

  set_global_snapshot(note_path: string, snapshot: LinksSnapshot) {
    this.active_note_path = note_path;
    this.global_status = "ready";
    this.global_error = null;
    this.backlinks = snapshot.backlinks;
    this.outlinks = snapshot.outlinks;
    this.orphan_links = snapshot.orphan_links;
    this.attachments = snapshot.attachments;
  }

  set_global_error(note_path: string, error: string | null) {
    this.active_note_path = note_path;
    this.global_status = "error";
    this.global_error = error;
    this.backlinks = [];
    this.outlinks = [];
    this.orphan_links = [];
    this.attachments = [];
  }

  start_suggested_links_load(note_path: string) {
    this.suggested_links_note_path = note_path;
    this.suggested_links_loading = true;
    this.suggested_links = [];
  }

  set_suggested_links(note_path: string, links: SuggestedLink[]) {
    this.suggested_links_note_path = note_path;
    this.suggested_links_loading = false;
    this.suggested_links = links;
  }

  clear_suggested_links() {
    this.suggested_links_note_path = null;
    this.suggested_links_loading = false;
    this.suggested_links = [];
  }

  start_related_load(note_path: string) {
    this.related_note_path = note_path;
    this.related_loading = true;
    this.related_shared_tag = [];
    this.related_unlinked = [];
  }

  set_related(
    note_path: string,
    related: { shared_tag: NoteMeta[]; unlinked: NoteMeta[] },
  ) {
    this.related_note_path = note_path;
    this.related_loading = false;
    this.related_shared_tag = related.shared_tag;
    this.related_unlinked = related.unlinked;
  }

  remove_unlinked_mention(path: string) {
    this.related_unlinked = this.related_unlinked.filter(
      (note) => note.path !== path,
    );
  }

  clear_related() {
    this.related_note_path = null;
    this.related_loading = false;
    this.related_shared_tag = [];
    this.related_unlinked = [];
  }

  clear() {
    this.active_note_path = null;
    this.local_outlink_paths = [];
    this.local_attachment_paths = [];
    this.external_links = [];
    this.backlinks = [];
    this.outlinks = [];
    this.orphan_links = [];
    this.attachments = [];
    this.global_status = "idle";
    this.global_error = null;
    this.clear_suggested_links();
    this.clear_related();
  }

  reset() {
    this.clear();
  }
}
