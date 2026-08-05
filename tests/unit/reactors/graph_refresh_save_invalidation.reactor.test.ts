/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { listen } from "@tauri-apps/api/event";
import { create_graph_refresh_reactor } from "$lib/reactors/graph_refresh.reactor.svelte";
import { METADATA_REFRESH_DEBOUNCE_MS } from "$lib/reactors/metadata_changed";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { create_test_vault } from "../helpers/test_fixtures";
import {
  capture_tauri_listen,
  flush_effects,
} from "../helpers/tauri_event_mock";

function make_graph_service() {
  return {
    clear: vi.fn(),
    invalidate_cache: vi.fn().mockResolvedValue(undefined),
    load_note_neighborhood: vi.fn().mockResolvedValue(undefined),
    load_vault_graph: vi.fn().mockResolvedValue(undefined),
  };
}

async function drain_debounce() {
  await vi.advanceTimersByTimeAsync(METADATA_REFRESH_DEBOUNCE_MS);
  await flush_effects();
}

function setup() {
  const captured = capture_tauri_listen(vi.mocked(listen));
  const graph_store = new GraphStore();
  const vault_store = new VaultStore();
  const graph_service = make_graph_service();
  vault_store.set_vault(create_test_vault());

  const unmount = create_graph_refresh_reactor(
    graph_store,
    vault_store,
    graph_service as never,
  );

  return { vault_store, graph_service, unmount, ...captured };
}

describe("graph_refresh reactor index-commit invalidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("invalidates the upserted note even while the graph panel is closed", async () => {
    const { vault_store, graph_service, unmount, emit } = setup();
    await flush_effects();
    graph_service.invalidate_cache.mockClear();

    emit({
      event_type: "upsert",
      vault_id: vault_store.vault?.id,
      path: "a.md",
    });
    await drain_debounce();

    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("a.md");
    expect(graph_service.load_note_neighborhood).not.toHaveBeenCalled();

    unmount();
  });

  it("coalesces a burst into one invalidation per path", async () => {
    const { vault_store, graph_service, unmount, emit } = setup();
    await flush_effects();
    graph_service.invalidate_cache.mockClear();

    for (let i = 0; i < 3; i += 1) {
      emit({
        event_type: "upsert",
        vault_id: vault_store.vault?.id,
        path: "a.md",
      });
    }
    emit({
      event_type: "upsert",
      vault_id: vault_store.vault?.id,
      path: "b.md",
    });
    await drain_debounce();

    expect(graph_service.invalidate_cache).toHaveBeenCalledTimes(2);
    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("a.md");
    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("b.md");

    unmount();
  });

  it("invalidates both paths of a rename", async () => {
    const { vault_store, graph_service, unmount, emit } = setup();
    await flush_effects();
    graph_service.invalidate_cache.mockClear();

    emit({
      event_type: "rename",
      vault_id: vault_store.vault?.id,
      path: "new.md",
      old_path: "old.md",
    });
    await drain_debounce();

    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("new.md");
    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("old.md");

    unmount();
  });

  it("ignores events from another vault", async () => {
    const { graph_service, unmount, emit } = setup();
    await flush_effects();
    graph_service.invalidate_cache.mockClear();

    emit({
      event_type: "upsert",
      vault_id: "some-other-vault",
      path: "a.md",
    });
    await drain_debounce();

    expect(graph_service.invalidate_cache).not.toHaveBeenCalled();

    unmount();
  });

  it("stops invalidating after unmount", async () => {
    const { vault_store, graph_service, unmount, unlisten, emit } = setup();
    await flush_effects();
    graph_service.invalidate_cache.mockClear();

    unmount();
    expect(unlisten).toHaveBeenCalled();

    emit({
      event_type: "upsert",
      vault_id: vault_store.vault?.id,
      path: "a.md",
    });
    await drain_debounce();

    expect(graph_service.invalidate_cache).not.toHaveBeenCalled();
  });
});
