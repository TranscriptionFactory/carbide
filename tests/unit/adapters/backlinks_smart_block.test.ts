/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { create_backlinks_smart_block_handler } from "$lib/features/smart_blocks";
import type {
  SmartBlockContext,
  SmartBlockSpec,
  NoteLinksSnapshot,
} from "$lib/features/smart_blocks";
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

function make_snapshot(
  backlinks: string[],
  outlinks: string[] = [],
): NoteLinksSnapshot {
  return {
    backlinks: backlinks.map(make_note),
    outlinks: outlinks.map(make_note),
    orphan_links: [],
    attachments: [],
  };
}

function make_spec(body = ""): SmartBlockSpec {
  return { type: "backlinks", body };
}

function make_ctx(overrides: Partial<SmartBlockContext> = {}) {
  const unsubscribe = vi.fn();
  let change_handler: ((event: VaultFsEvent) => void) | null = null;
  const ctx: SmartBlockContext = {
    note_path: "host.md",
    vault_id: "v" as never,
    open_note: vi.fn(),
    subscribe_to_changes: vi.fn((handler: (event: VaultFsEvent) => void) => {
      change_handler = handler;
      return unsubscribe;
    }),
    ...overrides,
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

describe("backlinks smart block handler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders backlinks as clickable rows that open the right note", async () => {
    const get_links = vi.fn(async () => make_snapshot(["b.md", "c.md"]));
    const handler = create_backlinks_smart_block_handler({ get_links });
    const { ctx } = make_ctx();
    const instance = handler.create(make_spec(), ctx);

    await vi.advanceTimersByTimeAsync(150);

    expect(get_links).toHaveBeenCalledWith("v", "host.md");
    const rows = instance.dom.querySelectorAll<HTMLElement>(".smart-block-row");
    expect(rows.length).toBe(2);

    rows[0]?.dispatchEvent(new MouseEvent("click"));
    expect(ctx.open_note).toHaveBeenCalledWith("b.md");
  });

  it("renders the empty state when there are no backlinks", async () => {
    const get_links = vi.fn(async () => make_snapshot([]));
    const handler = create_backlinks_smart_block_handler({ get_links });
    const instance = handler.create(make_spec(), make_ctx().ctx);

    await vi.advanceTimersByTimeAsync(150);

    expect(instance.dom.querySelector(".smart-block-empty")?.textContent).toBe(
      "No backlinks",
    );
  });

  it("renders outlinks when the body requests show: outlinks", async () => {
    const get_links = vi.fn(async () =>
      make_snapshot(["b.md"], ["x.md", "y.md"]),
    );
    const handler = create_backlinks_smart_block_handler({ get_links });
    const instance = handler.create(
      make_spec("show: outlinks"),
      make_ctx().ctx,
    );

    await vi.advanceTimersByTimeAsync(150);

    const paths = [
      ...instance.dom.querySelectorAll<HTMLElement>(".smart-block-path"),
    ].map((el) => el.textContent);
    expect(paths).toEqual(["x.md", "y.md"]);
  });

  it("shows a graceful prompt when the note has no path", async () => {
    const get_links = vi.fn(async () => make_snapshot(["b.md"]));
    const handler = create_backlinks_smart_block_handler({ get_links });
    const { ctx } = make_ctx({ note_path: null });
    const instance = handler.create(make_spec(), ctx);

    await vi.advanceTimersByTimeAsync(150);

    expect(get_links).not.toHaveBeenCalled();
    expect(instance.dom.querySelector(".smart-block-info")?.textContent).toBe(
      "Save note to see backlinks",
    );
  });

  it("re-runs (debounced) and re-renders on a vault change event", async () => {
    const get_links = vi
      .fn<(vault_id: string, note_path: string) => Promise<NoteLinksSnapshot>>()
      .mockResolvedValueOnce(make_snapshot(["b.md"]))
      .mockResolvedValueOnce(make_snapshot(["b.md", "c.md"]));
    const handler = create_backlinks_smart_block_handler({ get_links });
    const { ctx, fire_change } = make_ctx();
    const instance = handler.create(make_spec(), ctx);

    await vi.advanceTimersByTimeAsync(150);
    expect(instance.dom.querySelectorAll(".smart-block-row").length).toBe(1);

    fire_change();
    await vi.advanceTimersByTimeAsync(150);

    expect(get_links).toHaveBeenCalledTimes(2);
    expect(instance.dom.querySelectorAll(".smart-block-row").length).toBe(2);
  });

  it("re-parses the kind and re-runs when the body is updated", async () => {
    const get_links = vi.fn(async () =>
      make_snapshot(["b.md"], ["x.md", "y.md"]),
    );
    const handler = create_backlinks_smart_block_handler({ get_links });
    const instance = handler.create(make_spec(), make_ctx().ctx);

    await vi.advanceTimersByTimeAsync(150);
    expect(instance.dom.querySelectorAll(".smart-block-row").length).toBe(1);

    instance.update(make_spec("show: outlinks"));
    await vi.advanceTimersByTimeAsync(150);

    expect(get_links).toHaveBeenCalledTimes(2);
    expect(instance.dom.querySelectorAll(".smart-block-row").length).toBe(2);
  });

  it("drops a stale out-of-order result so the newest render wins", async () => {
    const slow = deferred<NoteLinksSnapshot>();
    const fast = deferred<NoteLinksSnapshot>();
    const get_links = vi
      .fn<(vault_id: string, note_path: string) => Promise<NoteLinksSnapshot>>()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const handler = create_backlinks_smart_block_handler({ get_links });
    const { ctx, fire_change } = make_ctx();
    const instance = handler.create(make_spec(), ctx);

    await vi.advanceTimersByTimeAsync(150);
    fire_change();
    await vi.advanceTimersByTimeAsync(150);
    expect(get_links).toHaveBeenCalledTimes(2);

    fast.resolve(make_snapshot(["fast.md"]));
    await vi.advanceTimersByTimeAsync(0);
    expect(instance.dom.querySelector(".smart-block-path")?.textContent).toBe(
      "fast.md",
    );

    slow.resolve(make_snapshot(["slow.md"]));
    await vi.advanceTimersByTimeAsync(0);
    expect(instance.dom.querySelector(".smart-block-path")?.textContent).toBe(
      "fast.md",
    );
  });

  it("unsubscribes and cancels pending runs on destroy", async () => {
    const get_links = vi.fn(async () => make_snapshot(["b.md"]));
    const handler = create_backlinks_smart_block_handler({ get_links });
    const { ctx, unsubscribe } = make_ctx();
    const instance = handler.create(make_spec(), ctx);

    instance.destroy();
    await vi.advanceTimersByTimeAsync(150);

    expect(get_links).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(instance.dom.isConnected).toBe(false);
  });
});
