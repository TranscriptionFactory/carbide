/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { AppContext } from "$lib/app/di/create_app_context";
import SearchGraphTabView from "$lib/features/graph/ui/search_graph_tab_view.svelte";
import Harness from "../../../helpers/search_graph_tab_view_harness.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import { flushSync } from "../../../helpers/svelte_client_runtime";

function render_tab(tab_id: string) {
  const stores = create_app_stores();
  stores.search_graph.create_instance(tab_id, "");
  const action_registry = { execute: vi.fn().mockResolvedValue(undefined) };
  const rendered = render_with_app_context(SearchGraphTabView, {
    app_context: {
      stores,
      action_registry,
      services: {},
    } as unknown as Partial<AppContext>,
    props: { tab_id, initial_query: "" },
  });
  return { stores, action_registry, ...rendered };
}

function type_query(target: Element, value: string) {
  const input = target.querySelector<HTMLInputElement>(
    'input[placeholder="Search notes..."]',
  );
  if (!input) throw new Error("search input not rendered");
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function search_calls(execute: ReturnType<typeof vi.fn>) {
  return execute.mock.calls.filter(
    ([id]) => id === ACTION_IDS.search_graph_execute,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("search_graph_tab_view debounced search", () => {
  it("runs the search for the tab the keystroke happened in", () => {
    const { action_registry, target, cleanup } = render_tab("sg-a");

    type_query(target, "alpha");
    vi.advanceTimersByTime(300);

    expect(search_calls(action_registry.execute)).toEqual([
      [ACTION_IDS.search_graph_execute, { tab_id: "sg-a", query: "alpha" }],
    ]);
    cleanup();
  });

  it("drops a pending search when the view is torn down", () => {
    const { action_registry, target, cleanup } = render_tab("sg-a");

    type_query(target, "alpha");
    cleanup();
    vi.advanceTimersByTime(300);

    expect(search_calls(action_registry.execute)).toEqual([]);
  });

  it("keeps a pending search on its own tab when the view is reused for another", () => {
    const stores = create_app_stores();
    stores.search_graph.create_instance("sg-a", "");
    stores.search_graph.create_instance("sg-b", "");
    const action_registry = { execute: vi.fn().mockResolvedValue(undefined) };
    const { app, target, cleanup } = render_with_app_context(Harness, {
      app_context: {
        stores,
        action_registry,
        services: {},
      } as unknown as Partial<AppContext>,
      props: { initial_tab_id: "sg-a" },
    });

    type_query(target, "alpha");
    (app as { switch_tab: (id: string) => void }).switch_tab("sg-b");
    flushSync();
    vi.advanceTimersByTime(300);

    expect(search_calls(action_registry.execute)).toEqual([
      [ACTION_IDS.search_graph_execute, { tab_id: "sg-a", query: "alpha" }],
    ]);
    expect(stores.search_graph.get_instance("sg-b")?.query).toBe("");
    cleanup();
  });
});
