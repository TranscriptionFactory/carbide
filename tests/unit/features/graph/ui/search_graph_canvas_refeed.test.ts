/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import SearchGraphTabView from "$lib/features/graph/ui/search_graph_tab_view.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";
import type { SearchGraphSnapshot } from "$lib/features/graph/ports";
import Harness from "../../../helpers/search_graph_canvas_harness.svelte";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

const counters = vi.hoisted(() => ({ set_graph: 0, workers: 0, destroyed: 0 }));

vi.mock("$lib/features/graph/domain/vault_graph_renderer", () => ({
  VaultGraphRenderer: class {
    user_has_interacted = false;
    on_node_click = () => {};
    on_node_hover = () => {};
    on_node_dblclick = () => {};
    on_node_contextmenu = () => {};
    on_edge_hover = () => {};
    initialize() {
      return Promise.resolve();
    }
    set_graph() {
      counters.set_graph++;
    }
    update_positions() {}
    set_filter() {}
    update_colors() {}
    select_node() {}
    select_nodes() {}
    highlight_node() {}
    set_semantic_edges() {}
    set_smart_link_edges() {}
    clear_edge_labels() {}
    fit_to_content() {}
    resize() {}
    destroy() {
      counters.destroyed++;
    }
  },
}));

vi.mock("$lib/features/graph/domain/vault_graph_worker?worker&inline", () => ({
  default: class {
    onmessage = null;
    onerror = null;
    constructor() {
      counters.workers++;
    }
    postMessage() {}
    terminate() {}
  },
}));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

const TAB = "tab-1";

function make_snapshot(): SearchGraphSnapshot {
  return {
    query: "q",
    nodes: [
      { path: "a.md", title: "A", kind: "hit", score: 0.9 },
      { path: "b.md", title: "B", kind: "hit", score: 0.5 },
      { path: "c.md", title: "C", kind: "neighbor" },
    ],
    edges: [
      { source: "a.md", target: "c.md", edge_type: "wiki" },
      { source: "a.md", target: "b.md", edge_type: "semantic", score: 0.2 },
    ],
    stats: {
      hit_count: 2,
      neighbor_count: 1,
      wiki_edge_count: 1,
      semantic_edge_count: 1,
      smart_link_edge_count: 0,
    },
  };
}

async function render_ready() {
  const store = new SearchGraphStore();
  store.create_instance(TAB, "q");
  store.set_snapshot(TAB, make_snapshot(), new Set(), null);
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(Harness, { target, props: { store, tab_id: TAB } });
  flushSync();
  await Promise.resolve();
  flushSync();
  return {
    store,
    cleanup: () => {
      void unmount(app);
      target.remove();
    },
  };
}

beforeEach(() => {
  counters.set_graph = 0;
  counters.workers = 0;
  counters.destroyed = 0;
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("search_graph_canvas layout feeding", () => {
  it("feeds the layout once on mount", async () => {
    const { cleanup } = await render_ready();
    expect(counters.set_graph).toBe(1);
    expect(counters.workers).toBe(1);
    cleanup();
  });

  it("does not restart the layout on hover, selection, or edge toggles", async () => {
    const { store, cleanup } = await render_ready();

    for (let i = 0; i < 20; i++) {
      store.set_hovered_node(TAB, i % 2 ? "a.md" : null);
      flushSync();
    }
    store.select_node(TAB, "b.md");
    store.toggle_selected(TAB, "a.md");
    store.toggle_semantic_edges(TAB);
    store.clear_scroll_to(TAB);
    flushSync();

    expect(counters.set_graph).toBe(1);
    expect(counters.workers).toBe(1);
    cleanup();
  });

  it("re-feeds when the visible node set changes", async () => {
    const { store, cleanup } = await render_ready();

    store.toggle_neighbors(TAB);
    flushSync();
    expect(counters.set_graph).toBe(2);

    store.set_snapshot(TAB, make_snapshot(), new Set(), null);
    flushSync();
    expect(counters.set_graph).toBe(3);
    cleanup();
  });
});

describe("search_graph_tab_view across searches", () => {
  async function render_tab_view() {
    const stores = create_app_stores();
    stores.search_graph.create_instance(TAB, "q");
    stores.search_graph.set_snapshot(TAB, make_snapshot(), new Set(), null);
    const rendered = render_with_app_context(SearchGraphTabView, {
      app_context: {
        stores,
        action_registry: { execute: vi.fn().mockResolvedValue(undefined) },
        services: {},
      } as unknown as Partial<AppContext>,
      props: { tab_id: TAB, initial_query: "q" },
    });
    await Promise.resolve();
    flushSync();
    return { stores, ...rendered };
  }

  it("keeps one renderer through a new search and re-feeds it once", async () => {
    const { stores, target, cleanup } = await render_tab_view();
    expect(counters.set_graph).toBe(1);

    stores.search_graph.set_loading(TAB);
    flushSync();
    expect(target.querySelector('[role="status"]')?.textContent).toContain(
      "Searching",
    );

    stores.search_graph.set_search_result(
      TAB,
      make_snapshot(),
      new Set(),
      null,
    );
    flushSync();
    await Promise.resolve();
    flushSync();

    expect(target.querySelector('[role="status"]')).toBeNull();
    expect(counters.destroyed).toBe(0);
    expect(counters.set_graph).toBe(2);
    cleanup();
  });
});
