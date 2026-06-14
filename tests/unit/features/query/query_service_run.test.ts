import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  QueryService,
  QueryParseError,
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

function make_backends(paths: string[]): QueryBackends {
  return {
    search: { search_notes: vi.fn().mockResolvedValue([]) } as never,
    index: {
      list_note_paths_by_prefix: vi.fn().mockResolvedValue(paths),
    } as never,
    tags: { get_notes_for_tag_prefix: vi.fn().mockResolvedValue([]) } as never,
    bases: {
      query: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    } as never,
  };
}

function make_saved_query_port(): SavedQueryPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(""),
    write: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe("QueryService.run (detached parse+solve)", () => {
  let store: QueryStore;
  let service: QueryService;

  beforeEach(() => {
    store = new QueryStore();
    service = new QueryService(
      make_backends(["work/a.md", "work/b.md"]),
      store,
      make_vault_store(),
      make_saved_query_port(),
      new OpStore(),
    );
  });

  it("returns matching items without mutating the panel store", async () => {
    const result = await service.run("notes in [[work]]");

    expect(result.items.map((i) => i.note.path)).toEqual([
      "work/a.md",
      "work/b.md",
    ]);

    expect(store.status).toBe("idle");
    expect(store.result).toBeNull();
    expect(store.query_text).toBe("");
    expect(store.error).toBeNull();
  });

  it("returns the same items execute() writes to the store", async () => {
    const run_result = await service.run("notes in [[work]]");
    await service.execute("notes in [[work]]");

    expect(store.result).not.toBeNull();
    expect(store.result?.items.map((i) => i.note.path)).toEqual(
      run_result.items.map((i) => i.note.path),
    );
  });

  it("returns an empty result for a blank query without mutating the store", async () => {
    const result = await service.run("   ");

    expect(result.items).toEqual([]);
    expect(store.status).toBe("idle");
    expect(store.result).toBeNull();
  });

  it("throws a QueryParseError with caret position on an invalid query", async () => {
    await expect(service.run("totally not a query")).rejects.toBeInstanceOf(
      QueryParseError,
    );

    try {
      await service.run("totally not a query");
      expect.unreachable("run should throw on a parse error");
    } catch (error) {
      expect(error).toBeInstanceOf(QueryParseError);
      const parse_error = (error as QueryParseError).query_error;
      expect(typeof parse_error.position).toBe("number");
      expect(parse_error.message.length).toBeGreaterThan(0);
    }

    expect(store.status).toBe("idle");
  });
});
