/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  create_tasks_smart_block_handler,
  type TaskQueryCallbacks,
} from "$lib/features/smart_blocks";
import type {
  SmartBlockContext,
  SmartBlockSpec,
} from "$lib/features/smart_blocks";
import type { Task, TaskQuery } from "$lib/features/task";

function make_task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    path: "notes/today.md",
    text: "buy milk",
    status: "todo",
    due_date: null,
    line_number: 1,
    section: null,
    ...overrides,
  };
}

function make_spec(body: string): SmartBlockSpec {
  return { type: "tasks", body };
}

function make_ctx(
  overrides: Partial<SmartBlockContext> = {},
): SmartBlockContext {
  return {
    note_path: null,
    vault_id: null,
    open_note: vi.fn(),
    subscribe_to_changes: vi.fn(() => () => undefined),
    ...overrides,
  };
}

function make_callbacks(
  overrides: Partial<TaskQueryCallbacks> = {},
): TaskQueryCallbacks {
  return {
    query_tasks: vi.fn(async (_query: TaskQuery) => [make_task()]),
    toggle_task: vi.fn(async (_task: Task) => undefined),
    ...overrides,
  };
}

describe("tasks smart block handler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders task rows after the debounce window", async () => {
    const callbacks = make_callbacks();
    const handler = create_tasks_smart_block_handler(callbacks);
    const instance = handler.create(make_spec("status is doing"), make_ctx());

    expect(callbacks.query_tasks).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(callbacks.query_tasks).toHaveBeenCalledTimes(1);
    expect(instance.dom.querySelectorAll(".task-query-item").length).toBe(1);
  });

  it("renders the empty-query state for a blank body", async () => {
    const callbacks = make_callbacks();
    const handler = create_tasks_smart_block_handler(callbacks);
    const instance = handler.create(make_spec("   "), make_ctx());

    await vi.runAllTimersAsync();

    expect(callbacks.query_tasks).not.toHaveBeenCalled();
    const empty = instance.dom.querySelector(".task-query-empty");
    expect(empty?.textContent).toBe("Empty query");
  });

  it("renders parse errors without querying", async () => {
    const callbacks = make_callbacks();
    const handler = create_tasks_smart_block_handler(callbacks);
    const instance = handler.create(
      make_spec("totally not a clause"),
      make_ctx(),
    );

    await vi.runAllTimersAsync();

    expect(callbacks.query_tasks).not.toHaveBeenCalled();
    expect(instance.dom.querySelector(".task-query-error")).not.toBeNull();
  });

  it("renders parse-error text as inert content, never as markup", async () => {
    const callbacks = make_callbacks();
    const handler = create_tasks_smart_block_handler(callbacks);
    const instance = handler.create(
      make_spec("<img src=x onerror=alert(1)>"),
      make_ctx(),
    );

    await vi.runAllTimersAsync();

    const error = instance.dom.querySelector(".task-query-error");
    expect(error).not.toBeNull();
    expect(instance.dom.querySelector("img")).toBeNull();
    expect(error?.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("re-runs the query when the vault emits a change", async () => {
    let emit: (() => void) | undefined;
    const callbacks = make_callbacks();
    const handler = create_tasks_smart_block_handler(callbacks);
    handler.create(
      make_spec("status is doing"),
      make_ctx({
        subscribe_to_changes: (handler_fn) => {
          emit = () => {
            handler_fn({} as never);
          };
          return () => undefined;
        },
      }),
    );

    await vi.runAllTimersAsync();
    expect(callbacks.query_tasks).toHaveBeenCalledTimes(1);

    emit?.();
    await vi.runAllTimersAsync();
    expect(callbacks.query_tasks).toHaveBeenCalledTimes(2);
  });

  it("toggles a task with the cycled status when its checkbox is clicked", async () => {
    const callbacks = make_callbacks({
      query_tasks: vi.fn(async () => [make_task({ status: "todo" })]),
    });
    const handler = create_tasks_smart_block_handler(callbacks);
    const instance = handler.create(make_spec("status is todo"), make_ctx());

    await vi.runAllTimersAsync();

    const checkbox = instance.dom.querySelector<HTMLInputElement>(
      ".task-query-item input[type=checkbox]",
    );
    expect(checkbox).not.toBeNull();
    checkbox!.dispatchEvent(new Event("change"));

    expect(callbacks.toggle_task).toHaveBeenCalledTimes(1);
    expect(callbacks.toggle_task).toHaveBeenCalledWith(
      expect.objectContaining({ status: "doing" }),
    );
  });

  it("does not render after destroy cancels the pending debounce", async () => {
    const callbacks = make_callbacks();
    const handler = create_tasks_smart_block_handler(callbacks);
    const instance = handler.create(make_spec("status is doing"), make_ctx());

    instance.destroy();
    await vi.runAllTimersAsync();

    expect(callbacks.query_tasks).not.toHaveBeenCalled();
    expect(instance.dom.isConnected).toBe(false);
  });
});
