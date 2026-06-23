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
