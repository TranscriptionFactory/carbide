/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import BasesTree from "$lib/features/bases/ui/bases_tree.svelte";
import BasesKanban from "$lib/features/bases/ui/bases_kanban.svelte";
import type { BaseNoteRow } from "$lib/features/bases/ports";
import { make_base_row } from "../../../helpers/bases_fixtures";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

const ROWS: BaseNoteRow[] = [
  make_base_row("a.md", { status: "done" }),
  make_base_row("b.md", { status: "todo" }),
  make_base_row("c.md", { status: "blocked" }),
];

function render_tree(descending: boolean) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(BasesTree, {
    target,
    props: {
      rows: ROWS,
      config: { group_by: ["status"] },
      available_properties: [],
      on_note_click: vi.fn(),
      on_config_change: vi.fn(),
      descending,
    },
  });
  flushSync();

  return { target, app };
}

function render_kanban(descending: boolean, column_order?: string[]) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(BasesKanban, {
    target,
    props: {
      rows: ROWS,
      config: column_order
        ? { group_by: "status", column_order }
        : { group_by: "status" },
      available_properties: [],
      on_note_click: vi.fn(),
      on_config_change: vi.fn(),
      descending,
    },
  });
  flushSync();

  return { target, app };
}

function labels(target: HTMLElement, testid: string): string[] {
  return [...target.querySelectorAll(`[data-testid="${testid}"]`)].map((el) =>
    (el.textContent ?? "").trim(),
  );
}

const tree_labels = (target: HTMLElement) => labels(target, "bases-tree-group");
const kanban_labels = (target: HTMLElement) =>
  labels(target, "bases-kanban-column");

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("bases grouped views honour the sort direction", () => {
  it("renders tree groups ascending when descending is false", () => {
    const view = render_tree(false);

    expect(tree_labels(view.target)).toEqual(["blocked", "done", "todo"]);

    void unmount(view.app);
  });

  it("renders tree groups reversed when descending is true", () => {
    const view = render_tree(true);

    expect(tree_labels(view.target)).toEqual(["todo", "done", "blocked"]);

    void unmount(view.app);
  });

  it("renders kanban columns ascending when descending is false", () => {
    const view = render_kanban(false);

    expect(kanban_labels(view.target)).toEqual(["blocked", "done", "todo"]);

    void unmount(view.app);
  });

  it("renders kanban columns reversed when descending is true", () => {
    const view = render_kanban(true);

    expect(kanban_labels(view.target)).toEqual(["todo", "done", "blocked"]);

    void unmount(view.app);
  });

  it("leaves a saved kanban column_order unchanged by the direction", () => {
    const order = ["todo", "blocked", "done"];
    const ascending = render_kanban(false, order);
    const descending = render_kanban(true, order);

    expect(kanban_labels(ascending.target)).toEqual(order);
    expect(kanban_labels(descending.target)).toEqual(order);

    void unmount(ascending.app);
    void unmount(descending.app);
  });
});
