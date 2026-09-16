// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { SearchStore } from "$lib/features/search";
import { BaseCountsStore } from "$lib/features/bases";
import type { BasesService } from "$lib/features/bases";
import { create_bases_counts_reactor } from "$lib/reactors/bases_counts.reactor.svelte";
import { vault_store_for } from "../helpers/test_fixtures";

function fake_service() {
  const refresh_counts = vi.fn(() => Promise.resolve());
  return {
    service: { refresh_counts } as unknown as BasesService,
    refresh_counts,
  };
}

function settle() {
  flushSync();
  vi.runAllTimers();
}

describe("bases counts reactor", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("refreshes once on vault open and not on idle → indexing", () => {
    const vault = vault_store_for("v1");
    const search = new SearchStore();
    const { service, refresh_counts } = fake_service();
    const stop = create_bases_counts_reactor(
      vault,
      search,
      service,
      new BaseCountsStore(),
    );
    settle();
    expect(refresh_counts).toHaveBeenCalledTimes(1);

    search.set_index_progress({ status: "started", total: 10 });
    settle();
    search.set_index_progress({ status: "progress", indexed: 5, total: 10 });
    settle();
    expect(refresh_counts).toHaveBeenCalledTimes(1);
    stop();
  });

  it("refreshes again when indexing completes", () => {
    const vault = vault_store_for("v1");
    const search = new SearchStore();
    const { service, refresh_counts } = fake_service();
    const stop = create_bases_counts_reactor(
      vault,
      search,
      service,
      new BaseCountsStore(),
    );
    settle();
    search.set_index_progress({ status: "started", total: 10 });
    settle();
    search.set_index_progress({ status: "completed", indexed: 10 });
    settle();

    expect(refresh_counts).toHaveBeenCalledTimes(2);
    expect(refresh_counts).toHaveBeenLastCalledWith("v1", expect.anything());
    stop();
  });

  it("clears counts and stops refreshing when the vault closes", () => {
    const vault = vault_store_for("v1");
    const search = new SearchStore();
    const counts = new BaseCountsStore();
    const clear = vi.spyOn(counts, "clear");
    const { service, refresh_counts } = fake_service();
    const stop = create_bases_counts_reactor(vault, search, service, counts);
    settle();

    vault.set_vault(null);
    settle();
    search.set_index_progress({ status: "completed", indexed: 10 });
    settle();

    expect(clear).toHaveBeenCalled();
    expect(refresh_counts).toHaveBeenCalledTimes(1);
    stop();
  });
});
