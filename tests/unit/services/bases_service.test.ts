import { describe, it, expect, vi } from "vitest";
import { BasesService } from "$lib/features/bases/application/bases_service";
import { BasesStore } from "$lib/features/bases/state/bases_store.svelte";
import type {
  BasesPort,
  PropertyInfo,
  BaseQueryResults,
  BaseViewDefinition,
} from "$lib/features/bases/ports";

const VAULT_ID = "vault-1" as never;

function make_port(overrides: Partial<BasesPort> = {}): BasesPort {
  return {
    list_properties: vi.fn().mockResolvedValue([]),
    query: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    save_view: vi.fn().mockResolvedValue(undefined),
    load_view: vi.fn().mockResolvedValue({
      name: "Default",
      query: { filters: [], sort: [], limit: 100, offset: 0 },
      view_mode: "table",
    }),
    ...overrides,
  };
}

function make_service(port_overrides: Partial<BasesPort> = {}) {
  const store = new BasesStore();
  const port = make_port(port_overrides);
  const service = new BasesService(port, store);
  return { service, store, port };
}

describe("BasesService", () => {
  it("refresh_properties calls port and updates store", async () => {
    const props: PropertyInfo[] = [
      { name: "title", property_type: "text", count: 5 },
      { name: "status", property_type: "text", count: 3 },
    ];
    const { service, store, port } = make_service({
      list_properties: vi.fn().mockResolvedValue(props),
    });

    await service.refresh_properties(VAULT_ID);

    expect(port.list_properties).toHaveBeenCalledWith(VAULT_ID);
    expect(store.available_properties).toEqual(props);
  });

  it("refresh_properties sets error state on failure", async () => {
    const { service, store } = make_service({
      list_properties: vi.fn().mockRejectedValue(new Error("network error")),
    });

    await service.refresh_properties(VAULT_ID);

    expect(store.error).toContain("network error");
  });

  it("run_query calls port with correct query and updates store", async () => {
    const results: BaseQueryResults = {
      rows: [],
      total: 7,
    };
    const query = { filters: [], sort: [], limit: 20, offset: 0 };
    const { service, store, port } = make_service({
      query: vi.fn().mockResolvedValue(results),
    });

    await service.run_query(VAULT_ID, query);

    expect(port.query).toHaveBeenCalledWith(VAULT_ID, query);
    expect(store.total_count).toBe(7);
  });

  it("run_query uses store query when no query argument is given", async () => {
    const { service, store, port } = make_service();

    store.query = { filters: [], sort: [], limit: 50, offset: 5 };
    await service.run_query(VAULT_ID);

    expect(port.query).toHaveBeenCalledWith(
      VAULT_ID,
      expect.objectContaining({ limit: 50, offset: 5 }),
    );
  });

  it("run_query sets loading false after execution", async () => {
    const { service, store } = make_service();

    await service.run_query(VAULT_ID);

    expect(store.loading).toBe(false);
  });

  it("run_query handles errors and sets error state", async () => {
    const { service, store } = make_service({
      query: vi.fn().mockRejectedValue(new Error("query failed")),
    });

    await service.run_query(VAULT_ID);

    expect(store.error).toContain("query failed");
    expect(store.loading).toBe(false);
  });

  it("run_query clears error before execution", async () => {
    const { service, store } = make_service();
    store.error = "stale error";

    await service.run_query(VAULT_ID);

    expect(store.error).toBeNull();
  });

  it("save_view calls port with vault_id, path, and constructed view", async () => {
    const { service, store, port } = make_service();
    store.query = { filters: [], sort: [], limit: 100, offset: 0 };
    store.active_view_mode = "list";

    await service.save_view(VAULT_ID, "views/my-view.md", "My View");

    expect(port.save_view).toHaveBeenCalledWith(VAULT_ID, "views/my-view.md", {
      name: "My View",
      query: store.query,
      view_mode: "list",
    });
  });

  it("save_view sets error on failure", async () => {
    const { service, store } = make_service({
      save_view: vi.fn().mockRejectedValue(new Error("write failed")),
    });

    await service.save_view(VAULT_ID, "views/v.md", "V");

    expect(store.error).toContain("write failed");
  });

  it("load_view calls port and applies view definition to store", async () => {
    const view_def: BaseViewDefinition = {
      name: "Board",
      query: {
        filters: [{ property: "status", operator: "eq", value: "done" }],
        sort: [],
        limit: 25,
        offset: 0,
      },
      view_mode: "list",
    };
    const { service, store, port } = make_service({
      load_view: vi.fn().mockResolvedValue(view_def),
      query: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    });

    await service.load_view(VAULT_ID, "views/board.md");

    expect(port.load_view).toHaveBeenCalledWith(VAULT_ID, "views/board.md");
    expect(store.query).toEqual(view_def.query);
    expect(store.active_view_mode).toBe("list");
  });

  it("load_view sets error on failure", async () => {
    const { service, store } = make_service({
      load_view: vi.fn().mockRejectedValue(new Error("not found")),
    });

    await service.load_view(VAULT_ID, "views/missing.md");

    expect(store.error).toContain("not found");
    expect(store.loading).toBe(false);
  });
});
