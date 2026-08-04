import { beforeEach, describe, expect, it, vi } from "vitest";
import { create_search_tauri_adapter } from "$lib/features/search/adapters/search_tauri_adapter";
import { as_vault_id } from "$lib/shared/types/ids";
import type { SearchQuery } from "$lib/shared/types/search";

const { tauri_invoke_mock } = vi.hoisted(() => ({
  tauri_invoke_mock: vi.fn().mockResolvedValue([]),
}));

vi.mock("$lib/shared/adapters/tauri_invoke", () => ({
  tauri_invoke: tauri_invoke_mock,
}));

const QUERY: SearchQuery = {
  raw: "foo",
  text: "foo",
  scope: "all",
  domain: "notes",
};

describe("search_tauri_adapter.search_notes", () => {
  beforeEach(() => {
    tauri_invoke_mock.mockClear();
    tauri_invoke_mock.mockResolvedValue([]);
  });

  it("forwards the requested limit to the index_search payload", async () => {
    const adapter = create_search_tauri_adapter();

    await adapter.search_notes(as_vault_id("vault-1"), QUERY, 200);

    expect(tauri_invoke_mock).toHaveBeenCalledWith("index_search", {
      vaultId: "vault-1",
      query: QUERY,
      limit: 200,
    });
  });

  it("forwards the default limit when none is supplied", async () => {
    const adapter = create_search_tauri_adapter();

    await adapter.search_notes(as_vault_id("vault-1"), QUERY);

    expect(tauri_invoke_mock).toHaveBeenCalledWith("index_search", {
      vaultId: "vault-1",
      query: QUERY,
      limit: 50,
    });
  });
});

// IndexNoteMeta carries no blurb column, so every index-sourced note arrives
// without one. Passing that `undefined` on made the context assembler throw on
// `block.text.trim()` the moment vault context was enabled.
describe("search_tauri_adapter note metadata", () => {
  const INDEX_META = {
    id: "notes/a.md",
    path: "notes/a.md",
    title: "A",
    name: "a",
    mtime_ms: 1,
    ctime_ms: 0,
    size_bytes: 10,
    file_type: null,
  };

  beforeEach(() => {
    tauri_invoke_mock.mockClear();
  });

  it("defaults a missing blurb to an empty string on link snapshots", async () => {
    tauri_invoke_mock.mockResolvedValue({
      backlinks: [INDEX_META],
      outlinks: [INDEX_META],
      orphan_links: [],
      attachments: [],
    });
    const adapter = create_search_tauri_adapter();

    const snapshot = await adapter.get_note_links_snapshot(
      as_vault_id("vault-1"),
      "notes/b.md",
    );

    expect(snapshot.backlinks[0]?.blurb).toBe("");
    expect(snapshot.outlinks[0]?.blurb).toBe("");
  });

  it("defaults a missing blurb to an empty string on similar notes", async () => {
    tauri_invoke_mock.mockResolvedValue([{ note: INDEX_META, distance: 0.2 }]);
    const adapter = create_search_tauri_adapter();

    const hits = await adapter.find_similar_notes(
      as_vault_id("vault-1"),
      "notes/b.md",
    );

    expect(hits[0]?.note.blurb).toBe("");
  });
});
