/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_code_block_view_prose_plugin } from "$lib/features/editor/adapters/code_block_view_plugin";
import type { SmartBlocksConfig } from "$lib/features/editor/adapters/code_block_view_plugin";
import {
  create_smart_block_registry,
  create_tasks_smart_block_handler,
  create_query_smart_block_handler,
  type TaskQueryCallbacks,
} from "$lib/features/smart_blocks";
import type { QueryResult } from "$lib/features/query";
import type { SmartBlockContext } from "$lib/features/smart_blocks";
import type { Task } from "$lib/features/task";

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

function make_smart_blocks_config(
  callbacks: TaskQueryCallbacks,
): SmartBlocksConfig {
  const registry = create_smart_block_registry();
  registry.register(create_tasks_smart_block_handler(callbacks));
  const make_context = (): SmartBlockContext => ({
    note_path: null,
    vault_id: null,
    open_note: () => {},
    subscribe_to_changes: () => () => {},
  });
  return { registry, make_context };
}

function create_editor_with_code_block(
  language: string = "",
  code: string = "",
): { view: EditorView; container: HTMLElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const code_block = schema.nodes.code_block.create(
    { language },
    code.length > 0 ? schema.text(code) : [],
  );
  const doc = schema.nodes.doc.create(null, [code_block]);

  const plugin = create_code_block_view_prose_plugin();
  const state = EditorState.create({ doc, plugins: [plugin] });

  const view = new EditorView(container, {
    state,
    dispatchTransaction: (tr) => {
      const new_state = view.state.apply(tr);
      view.updateState(new_state);
    },
  });

  return { view, container };
}

function get_code_block_wrapper(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".code-block-wrapper");
}

function get_mermaid_preview(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".mermaid-preview");
}

function get_mermaid_toggle_btn(
  container: HTMLElement,
): HTMLButtonElement | null {
  return container.querySelector(".mermaid-toggle-btn");
}

describe("CodeBlockView", () => {
  let container: HTMLElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
    vi.useRealTimers();
  });

  describe("collapse", () => {
    it("renders collapse button in toolbar", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      const btn = c.querySelector(".code-block-collapse");
      expect(btn).not.toBeNull();
      expect(btn?.closest(".code-block-toolbar")).not.toBeNull();

      view.destroy();
    });

    it("starts with data-collapsed false", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      const wrapper = get_code_block_wrapper(c);
      expect(wrapper?.dataset["collapsed"]).toBe("false");

      view.destroy();
    });

    it("dispatches transaction with collapsed=true on click", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      const btn = c.querySelector<HTMLButtonElement>(".code-block-collapse")!;
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const code_block_node = view.state.doc.child(0);
      expect(code_block_node.attrs["collapsed"]).toBe(true);

      const wrapper = get_code_block_wrapper(c);
      expect(wrapper?.dataset["collapsed"]).toBe("true");

      view.destroy();
    });

    it("shows line count element when collapsed", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "line1\nline2\nline3",
      );
      container = c;

      const line_count = c.querySelector<HTMLSpanElement>(
        ".code-block-line-count",
      )!;
      expect(line_count.textContent).toBe("3 lines");

      view.destroy();
    });

    it("toggles back to expanded on second click", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      const btn = c.querySelector<HTMLButtonElement>(".code-block-collapse")!;
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const code_block_node = view.state.doc.child(0);
      expect(code_block_node.attrs["collapsed"]).toBe(false);

      const wrapper = get_code_block_wrapper(c);
      expect(wrapper?.dataset["collapsed"]).toBe("false");

      view.destroy();
    });
  });

  describe("mermaid preview", () => {
    it("shows mermaid preview when code block has mermaid language", () => {
      const { view, container: c } = create_editor_with_code_block(
        "mermaid",
        "graph TD\n  A --> B",
      );
      container = c;

      const wrapper = get_code_block_wrapper(c);
      expect(wrapper).not.toBeNull();

      const preview = get_mermaid_preview(c);
      expect(preview).not.toBeNull();

      const toggle_btn = get_mermaid_toggle_btn(c);
      expect(toggle_btn).not.toBeNull();
      expect(toggle_btn?.textContent).toBe("Edit");

      view.destroy();
    });

    it("does not show mermaid preview for non-mermaid language", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      const preview = get_mermaid_preview(c);
      expect(preview).toBeNull();

      const toggle_btn = get_mermaid_toggle_btn(c);
      expect(toggle_btn).toBeNull();

      view.destroy();
    });

    it("adds mermaid preview when language changes to mermaid", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      expect(get_mermaid_preview(c)).toBeNull();

      const tr = view.state.tr.setNodeMarkup(0, undefined, {
        language: "mermaid",
      });
      view.dispatch(tr);

      expect(get_mermaid_preview(c)).not.toBeNull();
      expect(get_mermaid_toggle_btn(c)).not.toBeNull();

      view.destroy();
    });

    it("removes mermaid preview when language changes from mermaid", () => {
      const { view, container: c } = create_editor_with_code_block(
        "mermaid",
        "graph TD\n  A --> B",
      );
      container = c;

      expect(get_mermaid_preview(c)).not.toBeNull();

      const tr = view.state.tr.setNodeMarkup(0, undefined, {
        language: "javascript",
      });
      view.dispatch(tr);

      expect(get_mermaid_preview(c)).toBeNull();
      expect(get_mermaid_toggle_btn(c)).toBeNull();

      view.destroy();
    });
  });

  describe("keyboard escape", () => {
    it("creates paragraph after code block on Mod-Enter", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      expect(view.state.doc.childCount).toBe(1);

      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
      });
      view.dom.dispatchEvent(event);

      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.lastChild?.type.name).toBe("paragraph");

      view.destroy();
    });

    it("creates paragraph after code block on ArrowDown at end when at document end", () => {
      const code = "const x = 1;";
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        code,
      );
      container = c;

      const code_block_content_end = 1 + code.length;
      const tr = view.state.tr.setSelection(
        TextSelection.create(
          view.state.doc,
          code_block_content_end,
          code_block_content_end,
        ),
      );
      view.dispatch(tr);

      expect(view.state.doc.childCount).toBe(1);

      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
      });
      view.dom.dispatchEvent(event);

      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.lastChild?.type.name).toBe("paragraph");

      view.destroy();
    });

    it("creates paragraph after code block on ArrowDown at end even when content follows", () => {
      const code = "const x = 1;";
      const para = schema.nodes.paragraph.create(null, schema.text("after"));
      const code_block = schema.nodes.code_block.create(
        { language: "javascript" },
        schema.text(code),
      );
      const doc = schema.nodes.doc.create(null, [code_block, para]);

      const container_el = document.createElement("div");
      document.body.appendChild(container_el);
      container = container_el;

      const plugin = create_code_block_view_prose_plugin();
      const state = EditorState.create({ doc, plugins: [plugin] });

      const view = new EditorView(container_el, {
        state,
        dispatchTransaction: (tr) => {
          const new_state = view.state.apply(tr);
          view.updateState(new_state);
        },
      });

      const code_block_end = 1 + code.length;
      const tr = view.state.tr.setSelection(
        TextSelection.create(view.state.doc, code_block_end, code_block_end),
      );
      view.dispatch(tr);

      expect(view.state.doc.childCount).toBe(2);

      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
      });
      view.dom.dispatchEvent(event);

      expect(view.state.doc.childCount).toBe(3);
      expect(view.state.doc.child(1)?.type.name).toBe("paragraph");

      view.destroy();
    });

    it("creates paragraph before code block on ArrowUp at start when at document start", () => {
      const code = "const x = 1;";
      const code_block = schema.nodes.code_block.create(
        { language: "javascript" },
        schema.text(code),
      );
      const doc = schema.nodes.doc.create(null, [code_block]);

      const container_el = document.createElement("div");
      document.body.appendChild(container_el);
      container = container_el;

      const plugin = create_code_block_view_prose_plugin();
      const state = EditorState.create({ doc, plugins: [plugin] });

      const view = new EditorView(container_el, {
        state,
        dispatchTransaction: (tr) => {
          const new_state = view.state.apply(tr);
          view.updateState(new_state);
        },
      });

      const tr = view.state.tr.setSelection(
        TextSelection.create(view.state.doc, 1, 1),
      );
      view.dispatch(tr);

      expect(view.state.doc.childCount).toBe(1);

      const event = new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
      });
      view.dom.dispatchEvent(event);

      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.firstChild?.type.name).toBe("paragraph");

      view.destroy();
    });

    it("creates paragraph before code block on ArrowUp at start even when content precedes", () => {
      const code = "const x = 1;";
      const para = schema.nodes.paragraph.create(null, schema.text("before"));
      const code_block = schema.nodes.code_block.create(
        { language: "javascript" },
        schema.text(code),
      );
      const doc = schema.nodes.doc.create(null, [para, code_block]);

      const container_el = document.createElement("div");
      document.body.appendChild(container_el);
      container = container_el;

      const plugin = create_code_block_view_prose_plugin();
      const state = EditorState.create({ doc, plugins: [plugin] });

      const view = new EditorView(container_el, {
        state,
        dispatchTransaction: (tr) => {
          const new_state = view.state.apply(tr);
          view.updateState(new_state);
        },
      });

      const code_block_start = 1 + "before".length + 1 + 1;
      const tr = view.state.tr.setSelection(
        TextSelection.create(
          view.state.doc,
          code_block_start,
          code_block_start,
        ),
      );
      view.dispatch(tr);

      expect(view.state.doc.childCount).toBe(2);

      const event = new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
      });
      view.dom.dispatchEvent(event);

      expect(view.state.doc.childCount).toBe(3);
      expect(view.state.doc.child(1)?.type.name).toBe("paragraph");

      view.destroy();
    });
  });

  describe("double-click word selection", () => {
    function call_handle_double_click(
      plugin: ReturnType<typeof create_code_block_view_prose_plugin>,
      view: EditorView,
      pos: number,
      node: ProseNode,
    ): boolean {
      const handler = plugin.props.handleDoubleClickOn;
      if (!handler) throw new Error("Expected handleDoubleClickOn");
      return (
        handler as (view: EditorView, pos: number, node: ProseNode) => boolean
      )(view, pos, node);
    }

    it("selects word under cursor on double-click inside code block", () => {
      const code = "const x = 1;";
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        code,
      );
      container = c;

      const plugin = create_code_block_view_prose_plugin();
      const code_block_node = view.state.doc.child(0);
      // block_start = 1 (after doc open token), offset 3 lands inside "const"
      const pos = 1 + 3;

      const result = call_handle_double_click(
        plugin,
        view,
        pos,
        code_block_node,
      );

      expect(result).toBe(true);
      const { from, to } = view.state.selection;
      // "const" starts at offset 0, so from = block_start + 0 = 1, to = 1 + 5 = 6
      expect(from).toBe(1);
      expect(to).toBe(6);

      view.destroy();
    });

    it("selects word at end of line", () => {
      const code = "hello world";
      const { view, container: c } = create_editor_with_code_block("", code);
      container = c;

      const plugin = create_code_block_view_prose_plugin();
      const code_block_node = view.state.doc.child(0);
      // "world" starts at offset 6; click at offset 8 (inside "world")
      const pos = 1 + 8;

      const result = call_handle_double_click(
        plugin,
        view,
        pos,
        code_block_node,
      );

      expect(result).toBe(true);
      const { from, to } = view.state.selection;
      // "world" at offsets 6–11, block_start = 1
      expect(from).toBe(1 + 6);
      expect(to).toBe(1 + 11);

      view.destroy();
    });

    it("returns false for non-code-block nodes", () => {
      const para_text = "hello";
      const para = schema.nodes.paragraph.create(null, schema.text(para_text));
      const doc = schema.nodes.doc.create(null, [para]);

      const container_el = document.createElement("div");
      document.body.appendChild(container_el);
      container = container_el;

      const plugin = create_code_block_view_prose_plugin();
      const state = EditorState.create({ doc, plugins: [plugin] });

      const view = new EditorView(container_el, {
        state,
        dispatchTransaction: (tr) => {
          const new_state = view.state.apply(tr);
          view.updateState(new_state);
        },
      });

      const para_node = view.state.doc.child(0);
      const result = call_handle_double_click(plugin, view, 1, para_node);

      expect(result).toBe(false);

      view.destroy();
    });
  });

  describe("resize handle", () => {
    function get_resize_handle(c: HTMLElement): HTMLElement | null {
      return c.querySelector(".code-block-resize-handle");
    }

    function get_pre(c: HTMLElement): HTMLPreElement | null {
      return c.querySelector("pre");
    }

    it("renders a resize handle on code blocks", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      const handle = get_resize_handle(c);
      expect(handle).not.toBeNull();
      expect(handle?.contentEditable).toBe("false");

      view.destroy();
    });

    it("sets height on pre element during drag", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      const handle = get_resize_handle(c)!;
      const pre = get_pre(c)!;

      Object.defineProperty(pre, "getBoundingClientRect", {
        value: () => ({
          height: 200,
          top: 0,
          left: 0,
          right: 0,
          bottom: 200,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }),
      });

      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          clientY: 100,
          pointerId: 1,
          bubbles: true,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          clientY: 150,
          pointerId: 1,
          bubbles: true,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          clientY: 150,
          pointerId: 1,
          bubbles: true,
        }),
      );

      expect(pre.style.height).toBe("250px");
      expect(pre.style.maxHeight).toBe("none");

      const code_block_node = view.state.doc.child(0);
      expect(code_block_node.attrs.height).toBe(250);

      view.destroy();
    });

    it("enforces minimum height during drag", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      const handle = get_resize_handle(c)!;
      const pre = get_pre(c)!;

      Object.defineProperty(pre, "getBoundingClientRect", {
        value: () => ({
          height: 100,
          top: 0,
          left: 0,
          right: 0,
          bottom: 100,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }),
      });

      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          clientY: 100,
          pointerId: 1,
          bubbles: true,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          clientY: 0,
          pointerId: 1,
          bubbles: true,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          clientY: 0,
          pointerId: 1,
          bubbles: true,
        }),
      );

      expect(pre.style.height).toBe("48px");

      const code_block_node = view.state.doc.child(0);
      expect(code_block_node.attrs.height).toBe(48);

      view.destroy();
    });

    it("resets height on double-click", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      const handle = get_resize_handle(c)!;
      const pre = get_pre(c)!;

      pre.style.height = "300px";
      pre.style.maxHeight = "none";

      handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

      expect(pre.style.height).toBe("");
      expect(pre.style.maxHeight).toBe("");

      const code_block_node = view.state.doc.child(0);
      expect(code_block_node.attrs.height).toBeNull();

      view.destroy();
    });

    it("restores height from node attrs on construction", () => {
      const container_el = document.createElement("div");
      document.body.appendChild(container_el);
      container = container_el;

      const code_block = schema.nodes.code_block.create(
        { language: "javascript", height: 300 },
        schema.text("const x = 1;"),
      );
      const doc = schema.nodes.doc.create(null, [code_block]);
      const plugin = create_code_block_view_prose_plugin();
      const state = EditorState.create({ doc, plugins: [plugin] });

      const view = new EditorView(container_el, {
        state,
        dispatchTransaction: (tr) => {
          const new_state = view.state.apply(tr);
          view.updateState(new_state);
        },
      });

      const pre = get_pre(container_el)!;
      expect(pre.style.height).toBe("300px");
      expect(pre.style.maxHeight).toBe("none");

      view.destroy();
    });

    it("cleans up body styles when destroyed mid-drag", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      const handle = get_resize_handle(c)!;
      const pre = get_pre(c)!;

      Object.defineProperty(pre, "getBoundingClientRect", {
        value: () => ({
          height: 200,
          top: 0,
          left: 0,
          right: 0,
          bottom: 200,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }),
      });

      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          clientY: 100,
          pointerId: 1,
          bubbles: true,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          clientY: 150,
          pointerId: 1,
          bubbles: true,
        }),
      );

      expect(document.body.style.userSelect).toBe("none");

      view.destroy();

      expect(document.body.style.userSelect).toBe("");
    });
  });

  describe("tasks smart block (registry parity)", () => {
    function create_editor_with_tasks_block(
      code: string,
      callbacks: TaskQueryCallbacks,
    ): { view: EditorView; container: HTMLElement } {
      const container_el = document.createElement("div");
      document.body.appendChild(container_el);

      const code_block = schema.nodes.code_block.create(
        { language: "tasks" },
        code.length > 0 ? schema.text(code) : [],
      );
      const doc = schema.nodes.doc.create(null, [code_block]);

      const plugin = create_code_block_view_prose_plugin(
        make_smart_blocks_config(callbacks),
      );
      const state = EditorState.create({ doc, plugins: [plugin] });

      const view = new EditorView(container_el, {
        state,
        dispatchTransaction: (tr) => {
          const new_state = view.state.apply(tr);
          view.updateState(new_state);
        },
      });

      return { view, container: container_el };
    }

    it("renders task rows through the registry handler", async () => {
      const callbacks: TaskQueryCallbacks = {
        query_tasks: vi.fn(async () => [make_task()]),
        toggle_task: vi.fn(async () => {}),
      };
      const { view, container: c } = create_editor_with_tasks_block(
        "status is todo",
        callbacks,
      );
      container = c;

      const results = c.querySelector(".task-query-results");
      expect(results).not.toBeNull();
      expect(c.querySelector(".mermaid-toggle-btn")?.textContent).toBe("Edit");

      await vi.runAllTimersAsync();

      expect(callbacks.query_tasks).toHaveBeenCalledTimes(1);
      expect(c.querySelectorAll(".task-query-item").length).toBe(1);

      view.destroy();
    });

    it("toggles a task with the cycled status when its checkbox is clicked", async () => {
      const callbacks: TaskQueryCallbacks = {
        query_tasks: vi.fn(async () => [make_task({ status: "todo" })]),
        toggle_task: vi.fn(async () => {}),
      };
      const { view, container: c } = create_editor_with_tasks_block(
        "status is todo",
        callbacks,
      );
      container = c;

      await vi.runAllTimersAsync();

      const checkbox = c.querySelector<HTMLInputElement>(
        ".task-query-item input[type=checkbox]",
      )!;
      checkbox.dispatchEvent(new Event("change"));

      expect(callbacks.toggle_task).toHaveBeenCalledTimes(1);
      expect(callbacks.toggle_task).toHaveBeenCalledWith(
        expect.objectContaining({ status: "doing" }),
      );

      view.destroy();
    });

    it("tears down the smart block when language changes away from tasks", async () => {
      const callbacks: TaskQueryCallbacks = {
        query_tasks: vi.fn(async () => [make_task()]),
        toggle_task: vi.fn(async () => {}),
      };
      const { view, container: c } = create_editor_with_tasks_block(
        "status is todo",
        callbacks,
      );
      container = c;

      await vi.runAllTimersAsync();
      expect(c.querySelector(".task-query-results")).not.toBeNull();

      const tr = view.state.tr.setNodeMarkup(0, undefined, {
        language: "javascript",
      });
      view.dispatch(tr);

      expect(c.querySelector(".task-query-results")).toBeNull();
      expect(c.querySelector(".mermaid-toggle-btn")).toBeNull();

      view.destroy();
    });

    it("sets up the smart block when language changes to tasks", async () => {
      const callbacks: TaskQueryCallbacks = {
        query_tasks: vi.fn(async () => [make_task()]),
        toggle_task: vi.fn(async () => {}),
      };
      const container_el = document.createElement("div");
      document.body.appendChild(container_el);
      container = container_el;

      const code_block = schema.nodes.code_block.create(
        { language: "javascript" },
        schema.text("status is todo"),
      );
      const doc = schema.nodes.doc.create(null, [code_block]);
      const plugin = create_code_block_view_prose_plugin(
        make_smart_blocks_config(callbacks),
      );
      const state = EditorState.create({ doc, plugins: [plugin] });
      const view = new EditorView(container_el, {
        state,
        dispatchTransaction: (tr) => {
          view.updateState(view.state.apply(tr));
        },
      });

      expect(container_el.querySelector(".task-query-results")).toBeNull();

      view.dispatch(
        view.state.tr.setNodeMarkup(0, undefined, { language: "tasks" }),
      );

      expect(container_el.querySelector(".task-query-results")).not.toBeNull();

      await vi.runAllTimersAsync();
      expect(callbacks.query_tasks).toHaveBeenCalled();

      view.destroy();
    });

    it("transitions mermaid -> tasks: tears down mermaid, sets up smart block", async () => {
      const callbacks: TaskQueryCallbacks = {
        query_tasks: vi.fn(async () => [make_task()]),
        toggle_task: vi.fn(async () => {}),
      };
      const container_el = document.createElement("div");
      document.body.appendChild(container_el);
      container = container_el;

      const code_block = schema.nodes.code_block.create(
        { language: "mermaid" },
        schema.text("status is todo"),
      );
      const doc = schema.nodes.doc.create(null, [code_block]);
      const plugin = create_code_block_view_prose_plugin(
        make_smart_blocks_config(callbacks),
      );
      const state = EditorState.create({ doc, plugins: [plugin] });
      const view = new EditorView(container_el, {
        state,
        dispatchTransaction: (tr) => {
          view.updateState(view.state.apply(tr));
        },
      });

      expect(container_el.querySelector(".mermaid-preview")).not.toBeNull();
      expect(container_el.querySelector(".task-query-results")).toBeNull();

      view.dispatch(
        view.state.tr.setNodeMarkup(0, undefined, { language: "tasks" }),
      );

      expect(container_el.querySelector(".mermaid-preview")).toBeNull();
      expect(container_el.querySelector(".task-query-results")).not.toBeNull();

      await vi.runAllTimersAsync();
      expect(callbacks.query_tasks).toHaveBeenCalled();

      view.destroy();
    });

    it("transitions tasks -> mermaid: tears down smart block, sets up mermaid", async () => {
      const callbacks: TaskQueryCallbacks = {
        query_tasks: vi.fn(async () => [make_task()]),
        toggle_task: vi.fn(async () => {}),
      };
      const { view, container: c } = create_editor_with_tasks_block(
        "status is todo",
        callbacks,
      );
      container = c;

      await vi.runAllTimersAsync();
      expect(c.querySelector(".task-query-results")).not.toBeNull();
      expect(c.querySelector(".mermaid-toggle-btn")).not.toBeNull();

      view.dispatch(
        view.state.tr.setNodeMarkup(0, undefined, { language: "mermaid" }),
      );

      expect(c.querySelector(".task-query-results")).toBeNull();
      expect(c.querySelector(".mermaid-preview")).not.toBeNull();
      expect(c.querySelector(".mermaid-toggle-btn")).not.toBeNull();

      view.destroy();
    });

    it("round-trips tasks -> plain -> tasks without leaking chrome", async () => {
      const callbacks: TaskQueryCallbacks = {
        query_tasks: vi.fn(async () => [make_task()]),
        toggle_task: vi.fn(async () => {}),
      };
      const { view, container: c } = create_editor_with_tasks_block(
        "status is todo",
        callbacks,
      );
      container = c;

      await vi.runAllTimersAsync();

      view.dispatch(
        view.state.tr.setNodeMarkup(0, undefined, { language: "javascript" }),
      );
      expect(c.querySelectorAll(".task-query-results").length).toBe(0);
      expect(c.querySelectorAll(".mermaid-toggle-btn").length).toBe(0);

      view.dispatch(
        view.state.tr.setNodeMarkup(0, undefined, { language: "tasks" }),
      );

      expect(c.querySelectorAll(".task-query-results").length).toBe(1);
      expect(c.querySelectorAll(".mermaid-toggle-btn").length).toBe(1);

      await vi.runAllTimersAsync();
      expect(c.querySelectorAll(".task-query-item").length).toBe(1);

      view.destroy();
    });
  });

  describe("viewport-gated mount", () => {
    type MockObserverEntry = { isIntersecting: boolean; target: Element };

    class MockIntersectionObserver {
      static instances: MockIntersectionObserver[] = [];
      private elements: Element[] = [];
      constructor(private cb: (entries: MockObserverEntry[]) => void) {
        MockIntersectionObserver.instances.push(this);
      }
      observe(el: Element) {
        this.elements.push(el);
      }
      disconnect() {
        this.elements = [];
      }
      enter() {
        this.cb(
          this.elements.map((target) => ({ isIntersecting: true, target })),
        );
      }
    }

    let original_io: typeof IntersectionObserver | undefined;

    beforeEach(() => {
      MockIntersectionObserver.instances = [];
      original_io = globalThis.IntersectionObserver;
      globalThis.IntersectionObserver =
        MockIntersectionObserver as unknown as typeof IntersectionObserver;
    });

    afterEach(() => {
      globalThis.IntersectionObserver =
        original_io as typeof IntersectionObserver;
    });

    function make_query_config(run_query: (text: string) => Promise<QueryResult>) {
      const registry = create_smart_block_registry();
      registry.register(create_query_smart_block_handler({ run_query }));
      return {
        registry,
        make_context: () => ({
          note_path: null,
          vault_id: null,
          open_note: () => {},
          subscribe_to_changes: () => () => {},
        }),
      };
    }

    function create_editor_with_query_block(
      run_query: (text: string) => Promise<QueryResult>,
    ): { view: EditorView; container: HTMLElement } {
      const container_el = document.createElement("div");
      document.body.appendChild(container_el);
      const code_block = schema.nodes.code_block.create(
        { language: "query" },
        schema.text("notes with:#x"),
      );
      const doc = schema.nodes.doc.create(null, [code_block]);
      const plugin = create_code_block_view_prose_plugin(
        make_query_config(run_query),
      );
      const state = EditorState.create({ doc, plugins: [plugin] });
      const view = new EditorView(container_el, {
        state,
        dispatchTransaction: (tr) => {
          view.updateState(view.state.apply(tr));
        },
      });
      return { view, container: container_el };
    }

    const empty_result: QueryResult = {
      items: [],
      total: 0,
      elapsed_ms: 0,
      query_text: "",
    };

    it("defers the query until the block scrolls into view", async () => {
      const run_query = vi.fn(async () => empty_result);
      const { view, container: c } = create_editor_with_query_block(run_query);
      container = c;

      await vi.runAllTimersAsync();
      expect(run_query).not.toHaveBeenCalled();
      expect(c.querySelector(".smart-block-results")).toBeNull();

      MockIntersectionObserver.instances[0]?.enter();
      await vi.runAllTimersAsync();

      expect(run_query).toHaveBeenCalledTimes(1);
      expect(c.querySelector(".smart-block-results")).not.toBeNull();

      view.destroy();
    });

    it("does not leak an observer when destroyed before intersecting", () => {
      const run_query = vi.fn(async () => empty_result);
      const { view, container: c } = create_editor_with_query_block(run_query);
      container = c;

      const [observer] = MockIntersectionObserver.instances;
      if (!observer) throw new Error("observer was not created");
      const disconnect_spy = vi.spyOn(observer, "disconnect");

      view.destroy();

      expect(disconnect_spy).toHaveBeenCalled();
      expect(run_query).not.toHaveBeenCalled();
    });
  });
});
