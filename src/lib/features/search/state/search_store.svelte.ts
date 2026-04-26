import type { OmnibarItem, InFileMatch } from "$lib/shared/types/search";
import type { IndexProgressEvent } from "$lib/shared/types/search";

export type IndexProgress = {
  status: "idle" | "indexing" | "completed" | "failed";
  indexed: number;
  total: number;
  error: string | null;
};

export class SearchStore {
  omnibar_items = $state<OmnibarItem[]>([]);
  omnibar_items_raw = $state<OmnibarItem[]>([]);
  in_file_matches = $state<InFileMatch[]>([]);
  find_match_count = $state(0);
  index_progress = $state<IndexProgress>({
    status: "idle",
    indexed: 0,
    total: 0,
    error: null,
  });

  set_index_progress(event: IndexProgressEvent) {
    switch (event.status) {
      case "started":
        this.index_progress = {
          status: "indexing",
          indexed: 0,
          total: event.total,
          error: null,
        };
        break;
      case "progress":
        this.index_progress = {
          status: "indexing",
          indexed: event.indexed,
          total: event.total,
          error: null,
        };
        break;
      case "completed":
        this.index_progress = {
          status: "completed",
          indexed: event.indexed,
          total: event.indexed,
          error: null,
        };
        break;
      case "failed":
        this.index_progress = {
          status: "failed",
          indexed: 0,
          total: 0,
          error: event.error,
        };
        break;
    }
  }

  set_omnibar_items(items: OmnibarItem[]) {
    this.omnibar_items = items;
  }

  set_omnibar_items_raw(items: OmnibarItem[]) {
    this.omnibar_items_raw = items;
  }

  set_in_file_matches(matches: InFileMatch[]) {
    this.in_file_matches = matches;
  }

  set_find_match_count(count: number) {
    this.find_match_count = count;
  }

  clear_omnibar() {
    this.omnibar_items = [];
    this.omnibar_items_raw = [];
  }

  clear_in_file_matches() {
    this.in_file_matches = [];
    this.find_match_count = 0;
  }

  reset() {
    this.omnibar_items = [];
    this.omnibar_items_raw = [];
    this.in_file_matches = [];
    this.find_match_count = 0;
    this.index_progress = { status: "idle", indexed: 0, total: 0, error: null };
  }
}
