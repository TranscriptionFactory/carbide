import type { OmnibarItem, InFileMatch } from "$lib/shared/types/search";
import type {
  EmbeddingProgressEvent,
  IndexProgressEvent,
} from "$lib/shared/types/search";

export type IndexProgress = {
  status: "idle" | "indexing" | "completed" | "failed";
  indexed: number;
  total: number;
  error: string | null;
};

export type EmbeddingProgress = {
  status: "idle" | "embedding" | "completed" | "failed";
  // Which of the two ordered passes is running. The section pass finishing is
  // not the run finishing, so the label must distinguish them.
  phase: "blocks" | "notes" | null;
  embedded: number;
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
  embedding_progress = $state<EmbeddingProgress>({
    status: "idle",
    phase: null,
    embedded: 0,
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

  set_embedding_progress(event: EmbeddingProgressEvent) {
    switch (event.status) {
      case "started":
        this.embedding_progress = {
          status: "embedding",
          phase: "notes",
          embedded: 0,
          total: event.total,
          error: null,
        };
        break;
      case "block_started":
        this.embedding_progress = {
          status: "embedding",
          phase: "blocks",
          embedded: 0,
          total: event.total,
          error: null,
        };
        break;
      case "progress":
        this.embedding_progress = {
          status: "embedding",
          phase: "notes",
          embedded: event.embedded,
          total: event.total,
          error: null,
        };
        break;
      case "block_progress":
        this.embedding_progress = {
          status: "embedding",
          phase: "blocks",
          embedded: event.embedded,
          total: event.total,
          error: null,
        };
        break;
      // The section pass completing only hands off to the note pass; claiming
      // "completed" here makes the status bar finish and then resume.
      case "block_completed":
        this.embedding_progress = {
          status: "embedding",
          phase: "blocks",
          embedded: event.embedded,
          total: event.embedded,
          error: null,
        };
        break;
      case "completed":
        this.embedding_progress = {
          status: "completed",
          phase: null,
          embedded: event.embedded,
          total: event.embedded,
          error: null,
        };
        break;
      case "failed":
        this.embedding_progress = {
          status: "failed",
          phase: null,
          embedded: 0,
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
    this.embedding_progress = {
      status: "idle",
      phase: null,
      embedded: 0,
      total: 0,
      error: null,
    };
  }
}
