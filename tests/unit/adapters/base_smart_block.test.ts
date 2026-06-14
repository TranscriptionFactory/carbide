/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushSync } from "svelte";
import { create_base_smart_block_handler } from "$lib/features/smart_blocks";
import type {
  BaseQueryOutcome,
  SmartBlockContext,
  SmartBlockSpec,
} from "$lib/features/smart_blocks";
import type { BaseNoteRow, PropertyInfo } from "$lib/features/bases";
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

function make_row(path: string, status: string): BaseNoteRow {
  return {
    note: make_note(path),
    properties: { status: { value: status, property_type: "text" } },
    tags: [],
    stats: {
      word_count: 0,
      char_count: 0,
      heading_count: 0,
      outlink_count: 0,
      reading_time_secs: 0,
      task_count: 0,
      tasks_done: 0,
      tasks_todo: 0,
      next_due_date: null,
      last_indexed_at: 0,
    },
  };
}

const STATUS_PROP: PropertyInfo = {
  name: "status",
  property_type: "text",
  count: 2,
  unique_values: ["todo", "done"],
};

function make_outcome(rows: BaseNoteRow[], total?: number): BaseQueryOutcome {
  return {
    rows,
    available_properties: [STATUS_PROP],
    ...(total !== undefined && { total }),
  };
}

function make_spec(body: string): SmartBlockSpec {
  return { type: "base", body };
}

function make_ctx(overrides: Partial<SmartBlockContext> = {}) {
  const unsubscribe = vi.fn();
  let change_handler: ((event: VaultFsEvent) => void) | null = null;
  const ctx: SmartBlockContext = {
    note_path: "host.md",
    vault_id: "v" as never,
    open_note: vi.fn(),
    update_body: vi.fn(),
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

async function settle(ms = 150) {
  await vi.advanceTimersByTimeAsync(ms);
  flushSync();
}

const KANBAN_BODY =
  "view: kanban\ngroup_by: status\nquery: notes with:#project-x";

describe("base smart block handler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a kanban grouped by status; clicking a card opens the note", async () => {
    const run_base_query = vi.fn(async () =>
      make_outcome([make_row("a.md", "todo"), make_row("b.md", "done")]),
    );
    const handler = create_base_smart_block_handler({ run_base_query });
    const { ctx } = make_ctx();
    const instance = handler.create(make_spec(KANBAN_BODY), ctx);

    await settle();

    expect(run_base_query).toHaveBeenCalledWith("v", "notes with:#project-x");
    const text = instance.dom.textContent ?? "";
    expect(text).toContain("todo");
    expect(text).toContain("done");

    const card = [...instance.dom.querySelectorAll("button")].find(
      (b) =>
        !b.classList.contains("smart-block-view-btn") &&
        b.textContent?.includes("a"),
    );
    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ctx.open_note).toHaveBeenCalledWith("a.md");
  });

  it("switches to a table over the same rows when the view body changes", async () => {
    const run_base_query = vi.fn(async () =>
      make_outcome([make_row("a.md", "todo"), make_row("b.md", "done")]),
    );
    const handler = create_base_smart_block_handler({ run_base_query });
    const instance = handler.create(make_spec(KANBAN_BODY), make_ctx().ctx);

    await settle();
    expect(instance.dom.querySelector("table")).toBeNull();

    instance.update(make_spec("view: table\nquery: notes with:#project-x"));
    flushSync();

    expect(instance.dom.querySelector("table")).not.toBeNull();
    expect(run_base_query).toHaveBeenCalledTimes(1);
  });

  it("keeps two base blocks independent (separate stores)", async () => {
    const run_base_query = vi
      .fn<(vault_id: string, query: string) => Promise<BaseQueryOutcome>>()
      .mockResolvedValueOnce(make_outcome([make_row("a.md", "todo")]))
      .mockResolvedValueOnce(
        make_outcome([make_row("b.md", "done"), make_row("c.md", "done")]),
      );
    const handler = create_base_smart_block_handler({ run_base_query });
    const first = handler.create(
      make_spec("view: table\nquery: q1"),
      make_ctx().ctx,
    );
    const second = handler.create(
      make_spec("view: table\nquery: q2"),
      make_ctx().ctx,
    );

    await settle();

    expect(first.dom.querySelectorAll("tbody tr").length).toBe(1);
    expect(second.dom.querySelectorAll("tbody tr").length).toBe(2);
  });

  it("re-runs the query when the query body changes", async () => {
    const run_base_query = vi.fn(async () =>
      make_outcome([make_row("a.md", "todo")]),
    );
    const handler = create_base_smart_block_handler({ run_base_query });
    const instance = handler.create(
      make_spec("view: table\nquery: original"),
      make_ctx().ctx,
    );

    await settle();
    expect(run_base_query).toHaveBeenCalledTimes(1);

    instance.update(make_spec("view: table\nquery: changed"));
    await settle();

    expect(run_base_query).toHaveBeenCalledTimes(2);
    expect(run_base_query).toHaveBeenLastCalledWith("v", "changed");
  });

  it("re-runs on a vault change event", async () => {
    const run_base_query = vi.fn(async () =>
      make_outcome([make_row("a.md", "todo")]),
    );
    const handler = create_base_smart_block_handler({ run_base_query });
    const { ctx, fire_change } = make_ctx();
    handler.create(make_spec("view: table\nquery: notes"), ctx);

    await settle();
    expect(run_base_query).toHaveBeenCalledTimes(1);

    fire_change();
    await settle();
    expect(run_base_query).toHaveBeenCalledTimes(2);
  });

  it("persists config edits back into the block body", async () => {
    const run_base_query = vi.fn(async () =>
      make_outcome([make_row("a.md", "todo")]),
    );
    const handler = create_base_smart_block_handler({ run_base_query });
    const { ctx } = make_ctx();
    const instance = handler.create(
      make_spec("view: kanban\nquery: notes"),
      ctx,
    );

    await settle();

    const group_btn = [...instance.dom.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("status"),
    );
    expect(group_btn).toBeDefined();
    group_btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();

    expect(ctx.update_body).toHaveBeenCalledWith(
      "view: kanban\ngroup_by: status\nquery: notes",
    );
  });

  it("surfaces a 'showing N of M' affordance when the result set is capped", async () => {
    const run_base_query = vi.fn(async () =>
      make_outcome([make_row("a.md", "todo"), make_row("b.md", "done")], 57),
    );
    const handler = create_base_smart_block_handler({ run_base_query });
    const instance = handler.create(
      make_spec("view: table\nquery: notes"),
      make_ctx().ctx,
    );

    await settle();

    const affordance = instance.dom.querySelector(".smart-block-truncation");
    expect(affordance?.textContent).toContain("Showing 2 of 57");
  });

  it("omits the affordance when every match is shown", async () => {
    const run_base_query = vi.fn(async () =>
      make_outcome([make_row("a.md", "todo")], 1),
    );
    const handler = create_base_smart_block_handler({ run_base_query });
    const instance = handler.create(
      make_spec("view: table\nquery: notes"),
      make_ctx().ctx,
    );

    await settle();

    expect(instance.dom.querySelector(".smart-block-truncation")).toBeNull();
  });

  it("switches view mode from the in-block switcher, persisting to the body without re-querying", async () => {
    const run_base_query = vi.fn(async () =>
      make_outcome([make_row("a.md", "todo")]),
    );
    const handler = create_base_smart_block_handler({ run_base_query });
    const { ctx } = make_ctx();
    const instance = handler.create(make_spec(KANBAN_BODY), ctx);

    await settle();
    expect(instance.dom.querySelector("table")).toBeNull();

    const table_btn = [
      ...instance.dom.querySelectorAll(".smart-block-view-btn"),
    ].find((b) => b.textContent?.trim() === "table");
    expect(table_btn).toBeDefined();
    table_btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();

    expect(instance.dom.querySelector("table")).not.toBeNull();
    expect(ctx.update_body).toHaveBeenCalledWith(
      "view: table\nquery: notes with:#project-x",
    );
    expect(run_base_query).toHaveBeenCalledTimes(1);
  });

  it("renders an error state for an invalid body and never queries", async () => {
    const run_base_query = vi.fn(async () => make_outcome([]));
    const handler = create_base_smart_block_handler({ run_base_query });
    const instance = handler.create(make_spec("view: kanban"), make_ctx().ctx);

    await settle();

    expect(run_base_query).not.toHaveBeenCalled();
    expect(instance.dom.querySelector(".smart-block-error")?.textContent).toBe(
      "base block requires a query",
    );
  });

  it("drops a stale out-of-order result so the newest render wins", async () => {
    let resolve_slow!: (v: BaseQueryOutcome) => void;
    let resolve_fast!: (v: BaseQueryOutcome) => void;
    const run_base_query = vi
      .fn<(vault_id: string, query: string) => Promise<BaseQueryOutcome>>()
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve_slow = r;
        }),
      )
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve_fast = r;
        }),
      );
    const handler = create_base_smart_block_handler({ run_base_query });
    const { ctx, fire_change } = make_ctx();
    const instance = handler.create(
      make_spec("view: table\nquery: notes"),
      ctx,
    );

    await settle();
    fire_change();
    await settle();
    expect(run_base_query).toHaveBeenCalledTimes(2);

    resolve_fast(make_outcome([make_row("fast.md", "done")]));
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
    expect(instance.dom.textContent).toContain("fast");

    resolve_slow(make_outcome([make_row("slow.md", "todo")]));
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
    expect(instance.dom.textContent).toContain("fast");
    expect(instance.dom.textContent).not.toContain("slow");
  });

  it("unsubscribes, unmounts and detaches on destroy", async () => {
    const run_base_query = vi.fn(async () =>
      make_outcome([make_row("a.md", "todo")]),
    );
    const handler = create_base_smart_block_handler({ run_base_query });
    const { ctx, unsubscribe } = make_ctx();
    const instance = handler.create(
      make_spec("view: table\nquery: notes"),
      ctx,
    );

    await settle();
    expect(instance.dom.querySelector("table")).not.toBeNull();

    instance.destroy();
    flushSync();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(instance.dom.isConnected).toBe(false);
    expect(instance.dom.querySelector("table")).toBeNull();
  });
});
