/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
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

      const wrapper = get_code_block_wrapper(container!);
      expect(wrapper).not.toBeNull();

      const preview = get_mermaid_preview(container!);
      expect(preview).not.toBeNull();

      const toggle_btn = get_mermaid_toggle_btn(container!);
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

      const preview = get_mermaid_preview(container!);
      expect(preview).toBeNull();

      const toggle_btn = get_mermaid_toggle_btn(container!);
      expect(toggle_btn).toBeNull();

      view.destroy();
    });

    it("adds mermaid preview when language changes to mermaid", () => {
      const { view, container: c } = create_editor_with_code_block(
        "javascript",
        "const x = 1;",
      );
      container = c;

      expect(get_mermaid_preview(container!)).toBeNull();

      const tr = view.state.tr.setNodeMarkup(0, undefined, {
        language: "mermaid",
      });
      view.dispatch(tr);

      expect(get_mermaid_preview(container!)).not.toBeNull();
      expect(get_mermaid_toggle_btn(container!)).not.toBeNull();

      view.destroy();
    });

    it("removes mermaid preview when language changes from mermaid", () => {
      const { view, container: c } = create_editor_with_code_block(
        "mermaid",
        "graph TD\n  A --> B",
      );
      container = c;

      expect(get_mermaid_preview(container!)).not.toBeNull();

      const tr = view.state.tr.setNodeMarkup(0, undefined, {
        language: "javascript",
      });
      view.dispatch(tr);

      expect(get_mermaid_preview(container!)).toBeNull();
      expect(get_mermaid_toggle_btn(container!)).toBeNull();

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

      const wrapper = get_code_block_wrapper(container!);
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
      });
      wrapper?.dispatchEvent(event);

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

      const wrapper = get_code_block_wrapper(container!);
      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
      });
      wrapper?.dispatchEvent(event);

      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.lastChild?.type.name).toBe("paragraph");

      view.destroy();
    });

    it("does not create paragraph on ArrowDown when not at document end", () => {
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

      const code_block_end = 1 + code.length + 1;
      const tr = view.state.tr.setSelection(
        TextSelection.create(view.state.doc, code_block_end, code_block_end),
      );
      view.dispatch(tr);

      expect(view.state.doc.childCount).toBe(2);

      const wrapper = get_code_block_wrapper(container!);
      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
      });
      wrapper?.dispatchEvent(event);

      expect(view.state.doc.childCount).toBe(2);

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

      const wrapper = get_code_block_wrapper(container!);
      const event = new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
      });
      wrapper?.dispatchEvent(event);

      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.firstChild?.type.name).toBe("paragraph");

      view.destroy();
    });
  });
});
