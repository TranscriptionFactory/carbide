/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { listen } from "@tauri-apps/api/event";
import { create_graph_refresh_reactor } from "$lib/reactors/graph_refresh.reactor.svelte";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { create_test_vault } from "../helpers/test_fixtures";

const mock_listen = vi.mocked(listen);

type MetadataHandler = (event: { payload: unknown }) => void;

function make_graph_service() {
  return {
    clear: vi.fn(),
    invalidate_cache: vi.fn().mockResolvedValue(undefined),
    load_note_neighborhood: vi.fn().mockResolvedValue(undefined),
    load_vault_graph: vi.fn().mockResolvedValue(undefined),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  let handler: MetadataHandler | undefined;
  const unlisten = vi.fn();
  mock_listen.mockImplementation((_name, fn) => {
    handler = fn as MetadataHandler;
    return Promise.resolve(unlisten);
  });

  const graph_store = new GraphStore();
  const vault_store = new VaultStore();
  const graph_service = make_graph_service();
  vault_store.set_vault(create_test_vault());

  const unmount = create_graph_refresh_reactor(
    graph_store,
    vault_store,
    graph_service as never,
  );

  return {
    vault_store,
    graph_service,
    unmount,
    unlisten,
    emit: (payload: Record<string, unknown>) => handler?.({ payload }),
  };
}

describe("graph_refresh reactor index-commit invalidation", () => {
  it("invalidates the upserted note even while the graph panel is closed", async () => {
    const { vault_store, graph_service, unmount, emit } = setup();
    await flush();
    graph_service.invalidate_cache.mockClear();

    emit({
      event_type: "upsert",
      vault_id: vault_store.vault?.id,
      path: "a.md",
    });
    await flush();

    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("a.md");
    expect(graph_service.load_note_neighborhood).not.toHaveBeenCalled();

    unmount();
  });

  it("invalidates both paths of a rename", async () => {
    const { vault_store, graph_service, unmount, emit } = setup();
    await flush();
    graph_service.invalidate_cache.mockClear();

    emit({
      event_type: "rename",
      vault_id: vault_store.vault?.id,
      path: "new.md",
      old_path: "old.md",
    });
    await flush();

    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("new.md");
    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("old.md");

    unmount();
  });

  it("ignores events from another vault", async () => {
    const { graph_service, unmount, emit } = setup();
    await flush();
    graph_service.invalidate_cache.mockClear();

    emit({
      event_type: "upsert",
      vault_id: "some-other-vault",
      path: "a.md",
    });
    await flush();

    expect(graph_service.invalidate_cache).not.toHaveBeenCalled();

    unmount();
  });

  it("stops invalidating after unmount", async () => {
    const { vault_store, graph_service, unmount, unlisten, emit } = setup();
    await flush();
    graph_service.invalidate_cache.mockClear();

    unmount();
    expect(unlisten).toHaveBeenCalled();

    emit({
      event_type: "upsert",
      vault_id: vault_store.vault?.id,
      path: "a.md",
    });
    await flush();

    expect(graph_service.invalidate_cache).not.toHaveBeenCalled();
  });
});
