/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { create_graph_refresh_reactor } from "$lib/reactors/graph_refresh.reactor.svelte";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

function open_note_state(path: string) {
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path,
      title: path,
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
    },
    markdown: as_markdown_text(""),
    buffer_id: path,
    is_dirty: false,
  };
}

function make_graph_service() {
  return {
    clear: vi.fn(),
    invalidate_cache: vi.fn().mockResolvedValue(undefined),
    load_note_neighborhood: vi.fn().mockResolvedValue(undefined),
    load_vault_graph: vi.fn().mockResolvedValue(undefined),
  };
}

async function flush_effects() {
  flushSync();
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

describe("graph_refresh reactor save invalidation", () => {
  it("invalidates the saved note even while the graph panel is closed", async () => {
    const graph_store = new GraphStore();
    const vault_store = new VaultStore();
    const editor_store = new EditorStore();
    const graph_service = make_graph_service();

    vault_store.set_vault(create_test_vault());
    editor_store.set_open_note(open_note_state("a.md"));

    const unmount = create_graph_refresh_reactor(
      graph_store,
      vault_store,
      editor_store,
      graph_service as never,
    );
    await flush_effects();
    graph_service.invalidate_cache.mockClear();

    editor_store.set_dirty(as_note_path("a.md"), true);
    await flush_effects();
    editor_store.mark_clean(as_note_path("a.md"), 1000);
    await flush_effects();

    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("a.md");
    expect(graph_service.load_note_neighborhood).not.toHaveBeenCalled();

    unmount();
  });

  // Scenario A: a link added to a.md must show up as a backlink once the graph
  // centers on b.md, so saving a.md has to refresh it while a.md is centered.
  it("refreshes the edited note on save, then loads a newly centered note", async () => {
    const graph_store = new GraphStore();
    const vault_store = new VaultStore();
    const editor_store = new EditorStore();
    const graph_service = make_graph_service();

    vault_store.set_vault(create_test_vault());
    editor_store.set_open_note(open_note_state("a.md"));
    graph_store.set_panel_open(true);
    graph_store.set_snapshot({
      center: open_note_state("a.md").meta,
      backlinks: [],
      outlinks: [],
      orphan_links: [],
      stats: {
        node_count: 1,
        edge_count: 0,
        backlink_count: 0,
        outlink_count: 0,
        orphan_count: 0,
        bidirectional_count: 0,
      },
    });

    const unmount = create_graph_refresh_reactor(
      graph_store,
      vault_store,
      editor_store,
      graph_service as never,
    );
    await flush_effects();
    graph_service.invalidate_cache.mockClear();
    graph_service.load_note_neighborhood.mockClear();

    editor_store.set_dirty(as_note_path("a.md"), true);
    await flush_effects();
    editor_store.mark_clean(as_note_path("a.md"), 1000);
    await flush_effects();

    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("a.md");
    expect(graph_service.load_note_neighborhood).not.toHaveBeenCalled();

    editor_store.set_open_note(open_note_state("b.md"));
    graph_store.center_note_path = "b.md";
    await flush_effects();

    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("b.md");
    expect(graph_service.load_note_neighborhood).toHaveBeenCalledWith("b.md");

    unmount();
  });
});
