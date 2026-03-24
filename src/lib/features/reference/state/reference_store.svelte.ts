import type { CslItem } from "../types";

export class ReferenceStore {
  library_items = $state<CslItem[]>([]);
  search_results = $state<CslItem[]>([]);
  connection_status = $state<"idle" | "connected" | "disconnected">("idle");
  selected_citekeys = $state<string[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  set_library_items(items: CslItem[]) {
    this.library_items = items;
  }

  set_search_results(results: CslItem[]) {
    this.search_results = results;
  }

  set_connection_status(status: "idle" | "connected" | "disconnected") {
    this.connection_status = status;
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

  reset() {
    this.library_items = [];
    this.search_results = [];
    this.connection_status = "idle";
    this.selected_citekeys = [];
    this.loading = false;
    this.error = null;
  }
}
