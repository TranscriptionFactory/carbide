import { describe, it, expect, vi } from "vitest";
import { TaskService } from "$lib/features/task/application/task_service";
import { TaskStore } from "$lib/features/task/state/task_store.svelte";
import type { TaskPort } from "$lib/features/task/ports";
import type { EditorStore } from "$lib/features/editor";

const VAULT_ID = "vault-1" as never;

function make_port(overrides: Partial<TaskPort> = {}): TaskPort {
  return {
    queryTasks: vi.fn().mockResolvedValue([]),
    getTasksForNote: vi.fn().mockResolvedValue([]),
    updateTaskState: vi.fn().mockResolvedValue(undefined),
    updateTaskDueDate: vi.fn().mockResolvedValue(undefined),
    createTask: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function make_vault_store(vault_id = VAULT_ID) {
  return { vault: { id: vault_id } } as any;
}

function make_editor_store(open_note_path: string | null): EditorStore {
  return {
    open_note: open_note_path ? { meta: { path: open_note_path } } : null,
  } as any;
}

describe("TaskService write path routing", () => {
  it("routes to editor when active note matches task path and editor callback succeeds", async () => {
    const port = make_port();
    const store = new TaskStore();
    const editor_store = make_editor_store("notes/work.md");
    const editor_callback = vi.fn().mockReturnValue(true);

    const service = new TaskService(
      port,
      store,
      make_vault_store(),
      editor_store,
      editor_callback,
    );

    await service.updateTaskStatus("notes/work.md", 5, "done");

    expect(editor_callback).toHaveBeenCalledWith(5, "done");
    expect(port.updateTaskState).not.toHaveBeenCalled();
  });

  it("falls back to port write when active note path does not match", async () => {
    const port = make_port();
    const store = new TaskStore();
    const editor_store = make_editor_store("notes/other.md");
    const editor_callback = vi.fn().mockReturnValue(false);

    const service = new TaskService(
      port,
      store,
      make_vault_store(),
      editor_store,
      editor_callback,
    );

    await service.updateTaskStatus("notes/work.md", 5, "done");

    expect(editor_callback).not.toHaveBeenCalled();
    expect(port.updateTaskState).toHaveBeenCalledWith(VAULT_ID, {
      path: "notes/work.md",
      line_number: 5,
      status: "done",
    });
  });

  it("falls back to port write when editor callback returns false", async () => {
    const port = make_port();
    const store = new TaskStore();
    const editor_store = make_editor_store("notes/work.md");
    const editor_callback = vi.fn().mockReturnValue(false);

    const service = new TaskService(
      port,
      store,
      make_vault_store(),
      editor_store,
      editor_callback,
    );

    await service.updateTaskStatus("notes/work.md", 5, "done");

    expect(port.updateTaskState).toHaveBeenCalled();
  });
});
