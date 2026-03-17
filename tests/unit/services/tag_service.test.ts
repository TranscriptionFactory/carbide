import { describe, it, expect, vi } from "vitest";
import { TagService } from "$lib/features/tags/application/tag_service";
import { TagStore } from "$lib/features/tags/state/tag_store.svelte";
import type { TagPort } from "$lib/features/tags/ports";
import type { TagInfo } from "$lib/features/tags/types";

function make_vault_store(vault_id: string | null = "vault-1") {
  return {
    vault: vault_id ? { id: vault_id, name: "Test", path: "/test" } : null,
  } as never;
}

function make_port(overrides: Partial<TagPort> = {}): TagPort {
  return {
    list_all_tags: vi.fn().mockResolvedValue([]),
    get_notes_for_tag: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function make_service(
  port_overrides: Partial<TagPort> = {},
  vault_id: string | null = "vault-1",
) {
  const store = new TagStore();
  const port = make_port(port_overrides);
  const vault_store = make_vault_store(vault_id);
  const service = new TagService(port, store, vault_store);
  return { service, store, port };
}

describe("TagService", () => {
  it("refresh_tags calls port and updates store", async () => {
    const tags: TagInfo[] = [
      { tag: "rust", count: 5 },
      { tag: "svelte", count: 3 },
    ];
    const { service, store, port } = make_service({
      list_all_tags: vi.fn().mockResolvedValue(tags),
    });

    await service.refresh_tags();

    expect(port.list_all_tags).toHaveBeenCalledWith("vault-1");
    expect(store.tags).toEqual(tags);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("refresh_tags sets loading true during fetch and false after", async () => {
    let resolve_fn!: (v: TagInfo[]) => void;
    const deferred = new Promise<TagInfo[]>((res) => {
      resolve_fn = res;
    });
    const { service, store } = make_service({
      list_all_tags: vi.fn().mockReturnValue(deferred),
    });

    const promise = service.refresh_tags();
    expect(store.loading).toBe(true);

    resolve_fn([]);
    await promise;
    expect(store.loading).toBe(false);
  });

  it("refresh_tags sets error on failure", async () => {
    const { service, store } = make_service({
      list_all_tags: vi.fn().mockRejectedValue(new Error("network error")),
    });

    await service.refresh_tags();

    expect(store.error).toContain("network error");
    expect(store.loading).toBe(false);
  });

  it("refresh_tags clears previous error before fetch", async () => {
    const { service, store } = make_service();
    store.set_error("stale error");

    await service.refresh_tags();

    expect(store.error).toBeNull();
  });

  it("refresh_tags is no-op when no vault", async () => {
    const { service, store, port } = make_service({}, null);

    await service.refresh_tags();

    expect(port.list_all_tags).not.toHaveBeenCalled();
    expect(store.tags).toEqual([]);
  });

  it("select_tag calls port and updates store", async () => {
    const notes = ["notes/a.md", "notes/b.md"];
    const { service, store, port } = make_service({
      get_notes_for_tag: vi.fn().mockResolvedValue(notes),
    });

    await service.select_tag("rust");

    expect(port.get_notes_for_tag).toHaveBeenCalledWith("vault-1", "rust");
    expect(store.selected_tag).toBe("rust");
    expect(store.notes_for_tag).toEqual(notes);
    expect(store.notes_loading).toBe(false);
  });

  it("select_tag sets notes_loading true during fetch and false after", async () => {
    let resolve_fn!: (v: string[]) => void;
    const deferred = new Promise<string[]>((res) => {
      resolve_fn = res;
    });
    const { service, store } = make_service({
      get_notes_for_tag: vi.fn().mockReturnValue(deferred),
    });

    const promise = service.select_tag("rust");
    expect(store.notes_loading).toBe(true);

    resolve_fn([]);
    await promise;
    expect(store.notes_loading).toBe(false);
  });

  it("select_tag sets error on failure", async () => {
    const { service, store } = make_service({
      get_notes_for_tag: vi.fn().mockRejectedValue(new Error("query failed")),
    });

    await service.select_tag("rust");

    expect(store.error).toContain("query failed");
    expect(store.notes_loading).toBe(false);
  });

  it("select_tag is no-op when no vault", async () => {
    const { service, store, port } = make_service({}, null);

    await service.select_tag("rust");

    expect(port.get_notes_for_tag).not.toHaveBeenCalled();
    expect(store.selected_tag).toBeNull();
  });
});
