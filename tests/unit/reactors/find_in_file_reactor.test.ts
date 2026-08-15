/**
 * @vitest-environment jsdom
 */
//
// The jsdom pragma plus flushSync() is load-bearing: without both, a Svelte
// `$effect` body never runs and every assertion below passes vacuously. The
// "runs the effect at all" case is the positive control that catches it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { create_find_in_file_reactor } from "$lib/reactors/find_in_file.reactor.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import type { EditorService } from "$lib/features/editor";
import type {
  FindMatchesListener,
  FindOptions,
} from "$lib/features/editor/domain/find_types";

type FindCall = {
  query: string;
  selected_index: number;
  options: FindOptions;
  on_matches_change: FindMatchesListener | undefined;
};

// Mirrors the plugin: whatever the document currently contains is what a
// re-dispatch reports back, so a test can shrink the match set the way an edit
// would and still get a coherent count out of the round trip.
function create_editor_service_stub(match_count: number) {
  const doc = { match_count };
  const calls: FindCall[] = [];
  const service = {
    update_find_state: vi.fn(
      (
        query: string,
        selected_index: number,
        options: FindOptions,
        on_matches_change?: FindMatchesListener,
      ) => {
        calls.push({ query, selected_index, options, on_matches_change });
        return query ? doc.match_count : 0;
      },
    ),
  };
  return { service: service as unknown as EditorService, calls, doc };
}

function mount_reactor(match_count = 3) {
  const ui_store = new UIStore();
  const editor_store = new EditorStore();
  const search_store = new SearchStore();
  const { service, calls, doc } = create_editor_service_stub(match_count);

  const dispose = create_find_in_file_reactor(
    ui_store,
    editor_store,
    service,
    search_store,
  );
  flushSync();

  return { ui_store, search_store, calls, doc, dispose };
}

let dispose_reactor: (() => void) | null = null;

function open_find(ui_store: UIStore, query: string) {
  ui_store.find_in_file.open = true;
  ui_store.find_in_file.query = query;
  flushSync();
}

afterEach(() => {
  dispose_reactor?.();
  dispose_reactor = null;
});

describe("find_in_file reactor", () => {
  it("publishes the match count when the query changes", () => {
    const { ui_store, search_store, calls, dispose } = mount_reactor(3);
    dispose_reactor = dispose;

    open_find(ui_store, "foo");

    expect(search_store.find_match_count).toBe(3);
    expect(calls.at(-1)?.query).toBe("foo");
  });

  it("hands the plugin a listener so a re-scan can publish a fresh count", () => {
    const { ui_store, search_store, calls, dispose } = mount_reactor(3);
    dispose_reactor = dispose;

    open_find(ui_store, "foo");
    const listener = calls.at(-1)?.on_matches_change;
    expect(listener).toBeTypeOf("function");

    listener?.({ match_count: 5, selected_index: 0, range: null });
    flushSync();

    expect(search_store.find_match_count).toBe(5);
  });

  it("clamps the selected match index when the re-scan reports fewer matches", () => {
    const { ui_store, search_store, calls, doc, dispose } = mount_reactor(3);
    dispose_reactor = dispose;

    open_find(ui_store, "foo");
    ui_store.find_in_file.selected_match_index = 2;
    flushSync();

    doc.match_count = 1;
    calls
      .at(-1)
      ?.on_matches_change?.({ match_count: 1, selected_index: 0, range: null });
    flushSync();

    expect(ui_store.find_in_file.selected_match_index).toBe(0);
    expect(search_store.find_match_count).toBe(1);
  });

  it("leaves the selected match index alone when the re-scan agrees with it", () => {
    const { ui_store, calls, dispose } = mount_reactor(3);
    dispose_reactor = dispose;

    open_find(ui_store, "foo");
    ui_store.find_in_file.selected_match_index = 1;
    flushSync();
    const call_count_before = calls.length;

    calls
      .at(-1)
      ?.on_matches_change?.({ match_count: 4, selected_index: 1, range: null });
    flushSync();

    expect(ui_store.find_in_file.selected_match_index).toBe(1);
    expect(calls.length).toBe(call_count_before);
  });

  it("passes the captured range down when the scope is the selection", () => {
    const { ui_store, calls, dispose } = mount_reactor(3);
    dispose_reactor = dispose;

    ui_store.find_in_file.scope = "selection";
    ui_store.find_in_file.scope_range = { from: 10, to: 40 };
    open_find(ui_store, "foo");

    expect(calls.at(-1)?.options.range).toEqual({ from: 10, to: 40 });
  });

  it("mirrors the mapped range without re-running the effect", () => {
    const { ui_store, calls, dispose } = mount_reactor(3);
    dispose_reactor = dispose;

    ui_store.find_in_file.scope = "selection";
    ui_store.find_in_file.scope_range = { from: 10, to: 40 };
    open_find(ui_store, "foo");
    const call_count_before = calls.length;

    calls.at(-1)?.on_matches_change?.({
      match_count: 3,
      selected_index: 0,
      range: { from: 12, to: 42 },
    });
    flushSync();

    expect(ui_store.find_in_file.scope_range).toEqual({ from: 12, to: 42 });
    expect(calls.length).toBe(call_count_before);
  });

  it("sends the range down even while the scope is off, so it keeps mapping", () => {
    const { ui_store, calls, dispose } = mount_reactor(3);
    dispose_reactor = dispose;

    ui_store.find_in_file.scope_range = { from: 10, to: 40 };
    open_find(ui_store, "foo");

    expect(calls.at(-1)?.options.range).toEqual({ from: 10, to: 40 });
    expect(calls.at(-1)?.options.scope).toBe("document");
  });

  it("mirrors the mapped range while the scope is off", () => {
    const { ui_store, calls, dispose } = mount_reactor(3);
    dispose_reactor = dispose;

    ui_store.find_in_file.scope_range = { from: 10, to: 40 };
    open_find(ui_store, "foo");

    calls.at(-1)?.on_matches_change?.({
      match_count: 3,
      selected_index: 0,
      range: { from: 14, to: 44 },
    });
    flushSync();

    expect(ui_store.find_in_file.scope_range).toEqual({ from: 14, to: 44 });
  });

  it("drops a range reported gone while the scope is off", () => {
    const { ui_store, calls, dispose } = mount_reactor(3);
    dispose_reactor = dispose;

    ui_store.find_in_file.scope_range = { from: 10, to: 40 };
    open_find(ui_store, "foo");

    calls
      .at(-1)
      ?.on_matches_change?.({ match_count: 3, selected_index: 0, range: null });
    flushSync();

    expect(ui_store.find_in_file.scope_range).toBeNull();
  });

  it("falls back to document scope when the scoped range is reported gone", () => {
    const { ui_store, calls, dispose } = mount_reactor(3);
    dispose_reactor = dispose;

    ui_store.find_in_file.scope = "selection";
    ui_store.find_in_file.scope_range = { from: 10, to: 40 };
    open_find(ui_store, "foo");

    calls
      .at(-1)
      ?.on_matches_change?.({ match_count: 3, selected_index: 0, range: null });
    flushSync();

    expect(ui_store.find_in_file.scope).toBe("document");
    expect(ui_store.find_in_file.scope_range).toBeNull();
    expect(calls.at(-1)?.options.range).toBeUndefined();
  });

  it("clears the count when find closes", () => {
    const { ui_store, search_store, dispose } = mount_reactor(3);
    dispose_reactor = dispose;

    open_find(ui_store, "foo");
    expect(search_store.find_match_count).toBe(3);

    ui_store.find_in_file.open = false;
    flushSync();

    expect(search_store.find_match_count).toBe(0);
  });
});
