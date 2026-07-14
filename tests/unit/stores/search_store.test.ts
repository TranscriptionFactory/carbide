import { describe, expect, it } from "vitest";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import type { NoteId, NotePath } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";
import type { OmnibarItem, InFileMatch } from "$lib/shared/types/search";

function note(path: string): NoteMeta {
  return {
    id: path as NoteId,
    path: path as NotePath,
    name: path.split("/").pop()?.replace(".md", "") ?? "",
    title: path.split("/").pop()?.replace(".md", "") ?? "",
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

describe("SearchStore", () => {
  it("sets and clears omnibar items", () => {
    const store = new SearchStore();
    const items: OmnibarItem[] = [
      { kind: "note", note: note("a.md"), score: 1 },
    ];

    store.set_omnibar_items(items);
    expect(store.omnibar_items).toEqual(items);

    store.clear_omnibar();
    expect(store.omnibar_items).toEqual([]);
  });

  it("sets and clears in-file matches", () => {
    const store = new SearchStore();
    const matches: InFileMatch[] = [
      { line: 1, column: 5, length: 3, context: "foo bar baz" },
    ];

    store.set_in_file_matches(matches);
    expect(store.in_file_matches).toEqual(matches);

    store.clear_in_file_matches();
    expect(store.in_file_matches).toEqual([]);
  });

  it("resets all state", () => {
    const store = new SearchStore();

    store.set_omnibar_items([{ kind: "note", note: note("a.md"), score: 1 }]);
    store.set_in_file_matches([
      { line: 1, column: 0, length: 2, context: "hi" },
    ]);

    store.reset();

    expect(store.omnibar_items).toEqual([]);
    expect(store.in_file_matches).toEqual([]);
  });

  it("tracks a full embedding run through started/progress/completed", () => {
    const store = new SearchStore();

    store.set_embedding_progress({
      status: "started",
      vault_id: "vault-a",
      total: 4,
    });
    expect(store.embedding_progress).toEqual({
      status: "embedding",
      embedded: 0,
      total: 4,
      error: null,
    });

    store.set_embedding_progress({
      status: "progress",
      vault_id: "vault-a",
      embedded: 2,
      total: 4,
    });
    expect(store.embedding_progress).toEqual({
      status: "embedding",
      embedded: 2,
      total: 4,
      error: null,
    });

    store.set_embedding_progress({
      status: "completed",
      vault_id: "vault-a",
      embedded: 4,
      elapsed_ms: 10,
    });
    expect(store.embedding_progress).toEqual({
      status: "completed",
      embedded: 4,
      total: 4,
      error: null,
    });
  });

  it("tracks incremental block embedding events", () => {
    const store = new SearchStore();

    store.set_embedding_progress({
      status: "block_started",
      vault_id: "vault-a",
      total: 2,
    });
    expect(store.embedding_progress.status).toBe("embedding");

    store.set_embedding_progress({
      status: "block_progress",
      vault_id: "vault-a",
      embedded: 1,
      total: 2,
    });
    expect(store.embedding_progress).toEqual({
      status: "embedding",
      embedded: 1,
      total: 2,
      error: null,
    });

    store.set_embedding_progress({
      status: "block_completed",
      vault_id: "vault-a",
      embedded: 2,
    });
    expect(store.embedding_progress.status).toBe("completed");
  });

  it("records embedding failure and clears it on reset", () => {
    const store = new SearchStore();

    store.set_embedding_progress({
      status: "failed",
      vault_id: "vault-a",
      error: "model unavailable",
    });
    expect(store.embedding_progress).toEqual({
      status: "failed",
      embedded: 0,
      total: 0,
      error: "model unavailable",
    });

    store.reset();
    expect(store.embedding_progress).toEqual({
      status: "idle",
      embedded: 0,
      total: 0,
      error: null,
    });
  });
});
