/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_code_block_view_prose_plugin } from "$lib/features/editor/adapters/code_block_view_plugin";

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
});
