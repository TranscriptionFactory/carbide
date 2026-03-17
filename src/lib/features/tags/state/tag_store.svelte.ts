import type { TagInfo } from "../types";

export class TagStore {
  tags = $state<TagInfo[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  selected_tag = $state<string | null>(null);
  notes_for_tag = $state<string[]>([]);
  notes_loading = $state(false);
  search_query = $state("");

  get filtered_tags(): TagInfo[] {
    if (!this.search_query) return this.tags;
    const q = this.search_query.toLowerCase();
    return this.tags.filter((t) => t.tag.toLowerCase().includes(q));
  }

  set_tags(tags: TagInfo[]) {
    this.tags = tags;
  }

  set_loading(loading: boolean) {
    this.loading = loading;
  }

  set_error(error: string | null) {
    this.error = error;
  }

  select_tag(tag: string | null) {
    this.selected_tag = tag;
  }

  set_notes_for_tag(notes: string[]) {
    this.notes_for_tag = notes;
  }

  set_notes_loading(loading: boolean) {
    this.notes_loading = loading;
  }

  set_search_query(query: string) {
    this.search_query = query;
  }

  reset() {
    this.tags = [];
    this.loading = false;
    this.error = null;
    this.selected_tag = null;
    this.notes_for_tag = [];
    this.notes_loading = false;
    this.search_query = "";
  }
}
