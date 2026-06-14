/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { create_query_smart_block_handler } from "$lib/features/smart_blocks";
import type {
  SmartBlockContext,
  SmartBlockSpec,
  QueryResult,
} from "$lib/features/smart_blocks";
import { QueryParseError } from "$lib/features/query";
import type { NoteMeta } from "$lib/shared/types/note";
import type { VaultFsEvent } from "$lib/features/watcher";

function make_note(path: string): NoteMeta {
  const name = path.split("/").pop() ?? path;
  return {
    id: path as never,
    path: path as never,
    name,
    title: name.replace(/\.md$/, ""),
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function make_result(paths: string[]): QueryResult {
  return {
    items: paths.map((path) => ({
      note: make_note(path),
      matched_clauses: [],
    })),
    total: paths.length,
    elapsed_ms: 0,
    query_text: "",
  };
}

function make_spec(body: string): SmartBlockSpec {
  return { type: "query", body };
}

function make_ctx() {
  const unsubscribe = vi.fn();
  let change_handler: ((event: VaultFsEvent) => void) | null = null;
  const ctx: SmartBlockContext = {
    note_path: "host.md",
    vault_id: null,
    open_note: vi.fn(),
    subscribe_to_changes: vi.fn((handler: (event: VaultFsEvent) => void) => {
      change_handler = handler;
      return unsubscribe;
    }),
  };
  const fire_change = () =>
    change_handler?.({
      type: "note_added",
      vault_id: "v",
      note_path: "new.md",
    });
  return { ctx, unsubscribe, fire_change };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("query smart block handler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders clickable rows that open the right note", async () => {
    const run_query = vi.fn(async () => make_result(["a/1.md", "a/2.md"]));
    const handler = create_query_smart_block_handler({ run_query });
    const { ctx } = make_ctx();
    const instance = handler.create(make_spec("notes in:a/"), ctx);

    await vi.advanceTimersByTimeAsync(150);

    const rows = instance.dom.querySelectorAll<HTMLElement>(".smart-block-row");
    expect(rows.length).toBe(2);
    expect(rows[0]?.querySelector(".smart-block-path")?.textContent).toBe(
      "a/1.md",
    );

    rows[0]?.dispatchEvent(new MouseEvent("click"));
    expect(ctx.open_note).toHaveBeenCalledWith("a/1.md");
  });

  it("renders the empty state when there are no results", async () => {
    const run_query = vi.fn(async () => make_result([]));
    const handler = create_query_smart_block_handler({ run_query });
    const instance = handler.create(make_spec("notes in:a/"), make_ctx().ctx);

    await vi.advanceTimersByTimeAsync(150);

    const empty = instance.dom.querySelector(".smart-block-empty");
    expect(empty?.textContent).toBe("No results");
  });

  it("renders a parse error with its caret position without crashing", async () => {
    const run_query = vi.fn(async () => {
      throw new QueryParseError({
        message: "bad query",
        position: 5,
        length: 1,
      });
    });
    const handler = create_query_smart_block_handler({ run_query });
    const instance = handler.create(make_spec("notes !!!"), make_ctx().ctx);

    await vi.advanceTimersByTimeAsync(150);

    const error = instance.dom.querySelector(".smart-block-error");
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain("bad query");
    expect(error?.textContent).toContain("position 5");
  });

  it("re-runs the query when the block body is updated", async () => {
    const run_query = vi.fn(async () => make_result(["a/1.md"]));
    const handler = create_query_smart_block_handler({ run_query });
    const instance = handler.create(make_spec("notes in:a/"), make_ctx().ctx);

    await vi.advanceTimersByTimeAsync(150);
    expect(run_query).toHaveBeenCalledTimes(1);

    instance.update(make_spec("notes in:b/"));
    await vi.advanceTimersByTimeAsync(150);

    expect(run_query).toHaveBeenCalledTimes(2);
    expect(run_query).toHaveBeenLastCalledWith("notes in:b/");
  });

  it("re-runs (debounced) and re-renders on a vault change event", async () => {
    const run_query = vi
      .fn<(text: string) => Promise<QueryResult>>()
      .mockResolvedValueOnce(make_result(["a/1.md"]))
      .mockResolvedValueOnce(make_result(["a/1.md", "a/2.md"]));
    const handler = create_query_smart_block_handler({ run_query });
    const { ctx, fire_change } = make_ctx();
    const instance = handler.create(make_spec("notes in:a/"), ctx);

    await vi.advanceTimersByTimeAsync(150);
    expect(instance.dom.querySelectorAll(".smart-block-row").length).toBe(1);

    fire_change();
    await vi.advanceTimersByTimeAsync(150);

    expect(run_query).toHaveBeenCalledTimes(2);
    expect(instance.dom.querySelectorAll(".smart-block-row").length).toBe(2);
  });

  it("drops a stale out-of-order result so the newest render wins", async () => {
    const slow = deferred<QueryResult>();
    const fast = deferred<QueryResult>();
    const run_query = vi
      .fn<(text: string) => Promise<QueryResult>>()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const handler = create_query_smart_block_handler({ run_query });
    const { ctx, fire_change } = make_ctx();
    const instance = handler.create(make_spec("notes in:a/"), ctx);

    await vi.advanceTimersByTimeAsync(150);
    fire_change();
    await vi.advanceTimersByTimeAsync(150);
    expect(run_query).toHaveBeenCalledTimes(2);

    fast.resolve(make_result(["fast.md"]));
    await vi.advanceTimersByTimeAsync(0);
    expect(instance.dom.querySelector(".smart-block-path")?.textContent).toBe(
      "fast.md",
    );

    slow.resolve(make_result(["slow.md"]));
    await vi.advanceTimersByTimeAsync(0);
    expect(instance.dom.querySelector(".smart-block-path")?.textContent).toBe(
      "fast.md",
    );
  });

  it("unsubscribes and cancels pending runs on destroy", async () => {
    const run_query = vi.fn(async () => make_result(["a/1.md"]));
    const handler = create_query_smart_block_handler({ run_query });
    const { ctx, unsubscribe } = make_ctx();
    const instance = handler.create(make_spec("notes in:a/"), ctx);

    instance.destroy();
    await vi.advanceTimersByTimeAsync(150);

    expect(run_query).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(instance.dom.isConnected).toBe(false);
  });
});
