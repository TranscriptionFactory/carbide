import type { CslItem, LinkedSource, PdfAnnotation } from "../types";

export type LinkedSourceSyncStatus = "idle" | "scanning" | "error";

export type MissingLinkedSource = {
  source: LinkedSource;
  item_count: number;
};

export class ReferenceStore {
  library_items = $state<CslItem[]>([]);
  search_results = $state<CslItem[]>([]);
  extension_status = $state<Map<string, "idle" | "connected" | "disconnected">>(
    new Map(),
  );
  selected_citekeys = $state<string[]>([]);
  annotations_by_citekey = $state<Map<string, PdfAnnotation[]>>(new Map());
  loading = $state(false);
  error = $state<string | null>(null);

  linked_sources = $state<LinkedSource[]>([]);
  linked_source_sync_status = $state<Record<string, LinkedSourceSyncStatus>>(
    {},
  );
  missing_linked_sources = $state<MissingLinkedSource[]>([]);

  set_library_items(items: CslItem[]) {
    this.library_items = items;
  }

  set_search_results(results: CslItem[]) {
    this.search_results = results;
  }

  set_extension_status(
    ext_id: string,
    status: "idle" | "connected" | "disconnected",
  ) {
    const next = new Map(this.extension_status);
    next.set(ext_id, status);
    this.extension_status = next;
  }

  get_extension_status(ext_id: string): "idle" | "connected" | "disconnected" {
    return this.extension_status.get(ext_id) ?? "idle";
  }

  get_connected_extensions(): string[] {
    return [...this.extension_status.entries()]
      .filter(([, status]) => status === "connected")
      .map(([id]) => id);
  }

  set_selected_citekeys(citekeys: string[]) {
    this.selected_citekeys = citekeys;
  }

  toggle_citekey(citekey: string) {
    const next = [...this.selected_citekeys];
    const idx = next.indexOf(citekey);
    if (idx >= 0) {
      next.splice(idx, 1);
    } else {
      next.push(citekey);
    }
    this.selected_citekeys = next;
  }

  set_annotations(citekey: string, annotations: PdfAnnotation[]) {
    const next = new Map(this.annotations_by_citekey);
    next.set(citekey, annotations);
    this.annotations_by_citekey = next;
  }

  get_annotations(citekey: string): PdfAnnotation[] {
    return this.annotations_by_citekey.get(citekey) ?? [];
  }

  set_loading(loading: boolean) {
    this.loading = loading;
  }

  set_error(error: string | null) {
    this.error = error;
  }

  add_item(item: CslItem) {
    const existing_idx = this.library_items.findIndex((i) => i.id === item.id);
    if (existing_idx >= 0) {
      const updated = [...this.library_items];
      updated[existing_idx] = item;
      this.library_items = updated;
    } else {
      this.library_items = [...this.library_items, item];
    }
  }

  remove_item(citekey: string) {
    this.library_items = this.library_items.filter((i) => i.id !== citekey);
    this.selected_citekeys = this.selected_citekeys.filter(
      (k) => k !== citekey,
    );
  }

  set_linked_sources(sources: LinkedSource[]) {
    this.linked_sources = sources;
  }

  add_linked_source(source: LinkedSource) {
    this.linked_sources = [...this.linked_sources, source];
  }

  update_linked_source(id: string, patch: Partial<LinkedSource>) {
    this.linked_sources = this.linked_sources.map((s) =>
      s.id === id ? { ...s, ...patch } : s,
    );
  }

  remove_linked_source(id: string) {
    this.linked_sources = this.linked_sources.filter((s) => s.id !== id);
  }

  set_linked_source_sync_status(id: string, status: LinkedSourceSyncStatus) {
    this.linked_source_sync_status = {
      ...this.linked_source_sync_status,
      [id]: status,
    };
  }

  set_missing_linked_sources(missing: MissingLinkedSource[]) {
    this.missing_linked_sources = missing;
  }

  dismiss_missing_linked_source(source_id: string) {
    this.missing_linked_sources = this.missing_linked_sources.filter(
      (m) => m.source.id !== source_id,
    );
  }

  reset() {
    this.library_items = [];
    this.search_results = [];
    this.extension_status = new Map();
    this.selected_citekeys = [];
    this.annotations_by_citekey = new Map();
    this.loading = false;
    this.error = null;
    this.linked_sources = [];
    this.linked_source_sync_status = {};
    this.missing_linked_sources = [];
  }
}
