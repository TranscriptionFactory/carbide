// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import {
  AssistantChatStore,
  AssistantSessionStore,
} from "$lib/features/assistant";
import type {
  AssistantChatService,
  RetrievalReadiness,
} from "$lib/features/assistant";
import { VaultStore } from "$lib/features/vault";
import { BasesStore } from "$lib/features/bases";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { create_assistant_readiness_reactor } from "$lib/reactors/assistant_readiness.reactor.svelte";
import { create_test_vault, vault_store_for } from "../helpers/test_fixtures";
import type { VaultId } from "$lib/shared/types/ids";

const POLL_MS = 5000;

function make_chat_store() {
  return new AssistantChatStore(new AssistantSessionStore());
}

function fake_chat_service(readiness: () => RetrievalReadiness) {
  return {
    check_readiness: vi.fn(() => Promise.resolve(readiness())),
  } as unknown as AssistantChatService & {
    check_readiness: ReturnType<typeof vi.fn>;
  };
}

function fake_registry() {
  return {
    execute: vi.fn(() => Promise.resolve()),
  } as unknown as ActionRegistry & { execute: ReturnType<typeof vi.fn> };
}

function mount(overrides: {
  chat_store?: AssistantChatStore;
  service?: AssistantChatService;
  vault_store?: VaultStore;
  bases_store?: BasesStore;
  registry?: ActionRegistry;
}) {
  const chat_store = overrides.chat_store ?? make_chat_store();
  const service =
    overrides.service ?? fake_chat_service(() => ({ state: "ready" }));
  const vault_store = overrides.vault_store ?? vault_store_for("v1");
  const bases_store = overrides.bases_store ?? new BasesStore();
  const registry = overrides.registry ?? fake_registry();
  const cleanup = create_assistant_readiness_reactor(
    chat_store,
    service,
    vault_store,
    bases_store,
    registry,
    POLL_MS,
  );
  return { chat_store, service, vault_store, bases_store, registry, cleanup };
}

async function drain() {
  // settle the pending check_readiness promise queued by the effect
  await Promise.resolve();
  await Promise.resolve();
}

describe("assistant_readiness reactor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks the store ready and stops polling once ready", async () => {
    const service = fake_chat_service(() => ({ state: "ready" }));
    const { chat_store, cleanup } = mount({ service });
    flushSync();

    expect(chat_store.readiness).toEqual({ state: "checking" });
    await drain();
    expect(chat_store.readiness).toEqual({ state: "ready" });

    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(service.check_readiness).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("polls until the index reports ready", async () => {
    let ready = false;
    const service = fake_chat_service(() =>
      ready ? { state: "ready" } : { state: "indexing", embedded: 1, total: 2 },
    );
    const { chat_store, cleanup } = mount({ service });
    flushSync();
    await drain();

    expect(chat_store.readiness).toEqual({
      state: "indexing",
      embedded: 1,
      total: 2,
    });

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(service.check_readiness).toHaveBeenCalledTimes(2);

    ready = true;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(chat_store.readiness).toEqual({ state: "ready" });

    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(service.check_readiness).toHaveBeenCalledTimes(3);
    cleanup();
  });

  it("does not poll while no vault is active", async () => {
    const service = fake_chat_service(() => ({ state: "ready" }));
    const { chat_store, cleanup } = mount({
      service,
      vault_store: new VaultStore(),
    });
    flushSync();
    await drain();

    expect(chat_store.readiness).toEqual({ state: "checking" });
    expect(service.check_readiness).not.toHaveBeenCalled();
    cleanup();
  });

  it("re-arms the poll on a vault switch", async () => {
    const service = fake_chat_service(() => ({ state: "ready" }));
    const vault_store = vault_store_for("v1");
    const { chat_store, cleanup } = mount({ service, vault_store });
    flushSync();
    await drain();
    expect(service.check_readiness).toHaveBeenCalledTimes(1);

    vault_store.set_vault(create_test_vault({ id: "v2" as VaultId }));
    flushSync();
    expect(chat_store.readiness).toEqual({ state: "checking" });
    await drain();
    expect(service.check_readiness).toHaveBeenCalledTimes(2);
    expect(chat_store.readiness).toEqual({ state: "ready" });
    cleanup();
  });

  it("re-arms the poll on a provider change", async () => {
    const service = fake_chat_service(() => ({ state: "ready" }));
    const { chat_store, cleanup } = mount({ service });
    flushSync();
    await drain();
    expect(service.check_readiness).toHaveBeenCalledTimes(1);

    chat_store.set_provider("other-provider");
    flushSync();
    expect(chat_store.readiness).toEqual({ state: "checking" });
    await drain();
    expect(service.check_readiness).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it("ignores a stale readiness result after teardown", async () => {
    let resolve_readiness: (r: RetrievalReadiness) => void = () => {};
    const service = {
      check_readiness: vi.fn(
        () =>
          new Promise<RetrievalReadiness>((resolve) => {
            resolve_readiness = resolve;
          }),
      ),
    } as unknown as AssistantChatService;
    const { chat_store, cleanup } = mount({ service });
    flushSync();

    cleanup();
    resolve_readiness({ state: "ready" });
    await drain();

    expect(chat_store.readiness).toEqual({ state: "checking" });
  });

  it("lists base views once per vault when none are loaded", async () => {
    const registry = fake_registry();
    const vault_store = vault_store_for("v1");
    const { cleanup } = mount({ registry, vault_store });
    flushSync();

    expect(registry.execute).toHaveBeenCalledWith(ACTION_IDS.bases_list_views);
    expect(registry.execute).toHaveBeenCalledTimes(1);

    // same vault re-set: no second dispatch
    vault_store.set_vault(create_test_vault({ id: "v1" as VaultId }));
    flushSync();
    expect(registry.execute).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("skips the base-views dispatch when views are already loaded", () => {
    const registry = fake_registry();
    const bases_store = new BasesStore();
    bases_store.saved_views = [{ name: "View", path: "views/view.base" }];
    const { cleanup } = mount({ registry, bases_store });
    flushSync();

    expect(registry.execute).not.toHaveBeenCalled();
    cleanup();
  });
});
