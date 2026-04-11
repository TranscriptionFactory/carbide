import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("$lib/shared/utils/detect_platform", () => ({
  is_tauri: true,
}));

import { invoke } from "@tauri-apps/api/core";
import { create_storage_tauri_adapter } from "$lib/features/settings/adapters/storage_tauri_adapter";
import type { StorageStats } from "$lib/features/settings/ports";

const mock_invoke = vi.mocked(invoke);

describe("storage_tauri_adapter", () => {
  beforeEach(() => {
    mock_invoke.mockReset();
  });

  it("get_storage_stats calls correct command", async () => {
    const stats: StorageStats = {
      vault_dbs: [
        {
          vault_id: "abc",
          vault_name: "My Vault",
          size_bytes: 1024,
          is_orphaned: false,
        },
      ],
      total_db_bytes: 1024,
      orphaned_count: 0,
      orphaned_bytes: 0,
      embedding_cache_bytes: 5000,
    };
    mock_invoke.mockResolvedValueOnce(stats);

    const adapter = create_storage_tauri_adapter();
    const result = await adapter.get_storage_stats();

    expect(mock_invoke).toHaveBeenCalledWith("get_storage_stats", undefined);
    expect(result).toEqual(stats);
  });

  it("cleanup_orphaned_dbs returns bytes freed", async () => {
    mock_invoke.mockResolvedValueOnce(2048);

    const adapter = create_storage_tauri_adapter();
    const result = await adapter.cleanup_orphaned_dbs();

    expect(mock_invoke).toHaveBeenCalledWith("cleanup_orphaned_dbs", undefined);
    expect(result).toBe(2048);
  });

  it("clear_embedding_model_cache returns bytes freed", async () => {
    mock_invoke.mockResolvedValueOnce(10000);

    const adapter = create_storage_tauri_adapter();
    const result = await adapter.clear_embedding_model_cache();

    expect(mock_invoke).toHaveBeenCalledWith(
      "clear_embedding_model_cache",
      undefined,
    );
    expect(result).toBe(10000);
  });

  it("purge_all_asset_caches calls correct command", async () => {
    mock_invoke.mockResolvedValueOnce(undefined);

    const adapter = create_storage_tauri_adapter();
    await adapter.purge_all_asset_caches();

    expect(mock_invoke).toHaveBeenCalledWith(
      "purge_all_asset_caches",
      undefined,
    );
  });
});
