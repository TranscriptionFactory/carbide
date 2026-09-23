/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";
import type { SearchGraphSnapshot } from "$lib/features/graph/ports";
import Harness from "../../../helpers/search_graph_result_list_harness.svelte";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

const TAB = "tab-1";

function make_snapshot(): SearchGraphSnapshot {
  return {
    query: "q",
    nodes: [
      { path: "a.md", title: "A", kind: "hit", score: 0.9 },
      { path: "c.md", title: "C", kind: "neighbor" },
    ],
    edges: [{ source: "a.md", target: "c.md", edge_type: "wiki" }],
    stats: {
      hit_count: 1,
      neighbor_count: 1,
      wiki_edge_count: 1,
      semantic_edge_count: 0,
      smart_link_edge_count: 0,
    },
  };
}

function render_list() {
  const store = new SearchGraphStore();
  store.create_instance(TAB, "q");
  store.set_snapshot(TAB, make_snapshot(), new Set(), null);
  const on_scroll_done = vi.fn();
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(Harness, {
    target,
    props: { store, tab_id: TAB, on_scroll_done },
  });
  flushSync();
  return {
    store,
    on_scroll_done,
    cleanup: () => {
      void unmount(app);
      target.remove();
    },
  };
}

let scroll_into_view: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scroll_into_view = vi.fn();
  Element.prototype.scrollIntoView =
    scroll_into_view as unknown as Element["scrollIntoView"];
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("search_graph_result_list scroll_to_path", () => {
  it("clears scroll_to_path when the selected node's card is filtered out", () => {
    const { store, on_scroll_done, cleanup } = render_list();
    store.toggle_neighbors(TAB);
    flushSync();

    store.select_node(TAB, "c.md");
    flushSync();

    expect(on_scroll_done).toHaveBeenCalledTimes(1);
    expect(store.get_instance(TAB)?.scroll_to_path).toBeNull();
    expect(scroll_into_view).not.toHaveBeenCalled();
    cleanup();
  });

  it("does not scroll to a stale target when the filter is relaxed, only on re-select", () => {
    const { store, cleanup } = render_list();
    store.toggle_neighbors(TAB);
    flushSync();
    store.select_node(TAB, "c.md");
    flushSync();

    store.toggle_neighbors(TAB);
    flushSync();
    expect(scroll_into_view).not.toHaveBeenCalled();

    store.select_node(TAB, "c.md");
    flushSync();

    expect(scroll_into_view).toHaveBeenCalledTimes(1);
    expect(store.get_instance(TAB)?.scroll_to_path).toBeNull();
    cleanup();
  });
});
