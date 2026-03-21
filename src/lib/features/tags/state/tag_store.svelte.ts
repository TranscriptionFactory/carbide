import type { TagInfo } from "../types";

export class TagStore {
  tags = $state<TagInfo[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  selected_tag = $state<string | null>(null);
  selected_is_prefix = $state(false);
  notes_for_tag = $state<string[]>([]);
  notes_loading = $state(false);
  search_query = $state("");
  expanded_tags = $state<Set<string>>(new Set());

  set_tags(tags: TagInfo[]) {
    this.tags = tags;
  }

  set_loading(loading: boolean) {
    this.loading = loading;
  }

  set_error(error: string | null) {
    this.error = error;
  }

  select_tag(tag: string | null, is_prefix = false) {
    this.selected_tag = tag;
    this.selected_is_prefix = is_prefix;
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

  toggle_expanded(tag: string) {
    const next = new Set(this.expanded_tags);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    this.expanded_tags = next;
  }

  is_expanded(tag: string): boolean {
    return this.expanded_tags.has(tag);
  }

  reset() {
    this.tags = [];
    this.loading = false;
    this.error = null;
    this.selected_tag = null;
    this.selected_is_prefix = false;
    this.notes_for_tag = [];
    this.notes_loading = false;
    this.search_query = "";
    this.expanded_tags = new Set();
  }
}
