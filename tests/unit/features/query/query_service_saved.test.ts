import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  QueryService,
  QUERY_OP_KEYS,
} from "$lib/features/query/application/query_service";
import { QueryStore } from "$lib/features/query/state/query_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { SavedQueryPort } from "$lib/features/query/ports";
import type { VaultStore } from "$lib/features/vault";
import type { VaultId } from "$lib/shared/types/ids";
import type { QueryBackends } from "$lib/features/query/domain/query_solver";

const VAULT_ID = "test-vault" as VaultId;

function make_vault_store(): VaultStore {
  return {
    vault: { id: VAULT_ID, name: "Test", path: "/test" },
  } as VaultStore;
}

function make_backends(): QueryBackends {
  return {
    search: { search_notes: vi.fn().mockResolvedValue([]) } as never,
    index: {
      list_note_paths_by_prefix: vi.fn().mockResolvedValue([]),
    } as never,
    tags: { get_notes_for_tag_prefix: vi.fn().mockResolvedValue([]) } as never,
    bases: {
      query: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    } as never,
  };
}

function make_saved_query_port(
  overrides?: Partial<SavedQueryPort>,
): SavedQueryPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(""),
    write: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("QueryService saved queries", () => {
  let store: QueryStore;
  let op_store: OpStore;
  let port: SavedQueryPort;
  let service: QueryService;

  beforeEach(() => {
    store = new QueryStore();
    op_store = new OpStore();
    port = make_saved_query_port();
    service = new QueryService(
      make_backends(),
      store,
      make_vault_store(),
      port,
      op_store,
    );
  });

  describe("list_saved", () => {
    it("populates store with saved queries from port", async () => {
      const queries = [
        { path: "a.query", name: "a", mtime_ms: 100, size_bytes: 10 },
        { path: "b.query", name: "b", mtime_ms: 200, size_bytes: 20 },
      ];
      vi.mocked(port.list).mockResolvedValue(queries);

      await service.list_saved();
      expect(store.saved_queries).toEqual(queries);
    });

    it("sets empty list on error", async () => {
      vi.mocked(port.list).mockRejectedValue(new Error("fail"));
      store.set_saved_queries([
        { path: "old.query", name: "old", mtime_ms: 0, size_bytes: 0 },
      ]);

      await service.list_saved();
      expect(store.saved_queries).toEqual([]);
    });
  });

  describe("save", () => {
    it("writes query file and resyncs list", async () => {
      store.query_text = "notes with #project";
      vi.mocked(port.list).mockResolvedValue([
        {
          path: "my query.query",
          name: "my query",
          mtime_ms: 1000,
          size_bytes: 19,
        },
      ]);

      await service.save("my query");

      expect(op_store.get(QUERY_OP_KEYS.save).status).toBe("success");
      expect(port.write).toHaveBeenCalledWith(
        VAULT_ID,
        "my query.query",
        "notes with #project",
      );
      expect(store.saved_queries).toHaveLength(1);
      expect(store.active_saved_path).toBe("my query.query");
    });

    it("fails for invalid name via OpStore", async () => {
      store.query_text = "notes with #test";
      await service.save("");

      expect(op_store.get(QUERY_OP_KEYS.save).status).toBe("error");
      expect(op_store.get(QUERY_OP_KEYS.save).error).toContain("empty");
      expect(port.write).not.toHaveBeenCalled();
    });

    it("fails when no query text", async () => {
      store.query_text = "";
      await service.save("my query");

      expect(op_store.get(QUERY_OP_KEYS.save).status).toBe("error");
      expect(op_store.get(QUERY_OP_KEYS.save).error).toContain(
        "No query to save",
      );
    });

    it("fails on port error via OpStore", async () => {
      store.query_text = "notes with #test";
      vi.mocked(port.write).mockRejectedValue(new Error("disk full"));

      await service.save("my query");
      expect(op_store.get(QUERY_OP_KEYS.save).status).toBe("error");
      expect(op_store.get(QUERY_OP_KEYS.save).error).toBe("disk full");
    });
  });

  describe("load", () => {
    it("reads query and executes it", async () => {
      vi.mocked(port.read).mockResolvedValue("notes with #loaded");
      await service.load("test.query");

      expect(store.query_text).toBe("notes with #loaded");
      expect(store.active_saved_path).toBe("test.query");
    });

    it("sets error on read failure", async () => {
      vi.mocked(port.read).mockRejectedValue(new Error("not found"));
      await service.load("missing.query");

      expect(store.error).toBeTruthy();
      expect(store.error!.message).toBe("not found");
    });
  });

  describe("delete_saved", () => {
    it("removes file and updates store", async () => {
      store.set_saved_queries([
        { path: "test.query", name: "test", mtime_ms: 0, size_bytes: 0 },
      ]);
      store.active_saved_path = "test.query";

      await service.delete_saved("test.query");

      expect(port.remove).toHaveBeenCalledWith(VAULT_ID, "test.query");
      expect(store.saved_queries).toHaveLength(0);
      expect(store.active_saved_path).toBeNull();
    });

    it("surfaces delete error via OpStore", async () => {
      vi.mocked(port.remove).mockRejectedValue(new Error("permission denied"));
      store.set_saved_queries([
        { path: "test.query", name: "test", mtime_ms: 0, size_bytes: 0 },
      ]);

      await service.delete_saved("test.query");
      expect(op_store.get(QUERY_OP_KEYS.delete).status).toBe("error");
      expect(store.saved_queries).toHaveLength(1);
    });
  });

  describe("reset_save_op", () => {
    it("resets the save op in OpStore", () => {
      op_store.fail(QUERY_OP_KEYS.save, "old error");
      service.reset_save_op();
      expect(op_store.get(QUERY_OP_KEYS.save).status).toBe("idle");
    });
  });

  describe("no vault open", () => {
    it("save fails via OpStore when no vault", async () => {
      const no_vault_service = new QueryService(
        make_backends(),
        store,
        { vault: null } as unknown as VaultStore,
        port,
        op_store,
      );
      store.query_text = "test";
      await no_vault_service.save("name");
      expect(op_store.get(QUERY_OP_KEYS.save).status).toBe("error");
    });

    it("list_saved is a no-op when no vault", async () => {
      const no_vault_service = new QueryService(
        make_backends(),
        store,
        { vault: null } as unknown as VaultStore,
        port,
        op_store,
      );
      await no_vault_service.list_saved();
      expect(port.list).not.toHaveBeenCalled();
    });
  });
});
