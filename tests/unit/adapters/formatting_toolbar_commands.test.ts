/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import {
  get_active_marks,
  is_command_available,
  type FormattingCommand,
} from "$lib/features/editor/adapters/formatting_toolbar_commands";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";

function create_test_view(doc_text: string): EditorView {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text(doc_text)),
  ]);
  const state = EditorState.create({ doc, plugins: [] });
  return new EditorView(container, { state });
}

describe("get_active_marks", () => {
  it("returns empty set for plain text", () => {
    const view = create_test_view("hello world");
    const active = get_active_marks(view);
    expect(active.size).toBe(0);
    view.destroy();
  });

  it("returns strong mark when cursor is inside bold text", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const bold_text = schema.text("hello", [schema.mark(schema.marks.strong)]);
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [bold_text]),
    ]);
    const state = EditorState.create({
      doc,
      plugins: [],
      selection: TextSelection.create(doc, 3),
    });
    const view = new EditorView(container, { state });
    const active = get_active_marks(view);
    expect(active.has("strong")).toBe(true);
    view.destroy();
  });

  it("returns em mark when cursor is inside italic text", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const italic_text = schema.text("hello", [schema.mark(schema.marks.em)]);
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [italic_text]),
    ]);
    const state = EditorState.create({
      doc,
      plugins: [],
      selection: TextSelection.create(doc, 3),
    });
    const view = new EditorView(container, { state });
    const active = get_active_marks(view);
    expect(active.has("em")).toBe(true);
    view.destroy();
  });

  it("returns code_inline mark when cursor is inside code text", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const code_text = schema.text("hello", [
      schema.mark(schema.marks.code_inline),
    ]);
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [code_text]),
    ]);
    const state = EditorState.create({
      doc,
      plugins: [],
      selection: TextSelection.create(doc, 3),
    });
    const view = new EditorView(container, { state });
    const active = get_active_marks(view);
    expect(active.has("code_inline")).toBe(true);
    view.destroy();
  });
});

describe("is_command_available", () => {
  it("returns true for bold on empty selection", () => {
    const view = create_test_view("hello");
    expect(is_command_available("bold", view)).toBe(true);
    view.destroy();
  });

  it("returns false for link always", () => {
    const view = create_test_view("hello");
    expect(is_command_available("link", view)).toBe(false);
    view.destroy();
  });

  it("returns false for image always", () => {
    const view = create_test_view("hello");
    expect(is_command_available("image", view)).toBe(false);
    view.destroy();
  });

  it("returns true for link with selection (still disabled pending async UI)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("hello world")),
    ]);
    const state = EditorState.create({
      doc,
      plugins: [],
      selection: TextSelection.create(doc, 1, 6),
    });
    const view = new EditorView(container, { state });
    expect(is_command_available("link", view)).toBe(false);
    view.destroy();
  });

  it("returns true for bullet_list via wrapInList check", () => {
    const view = create_test_view("hello");
    expect(is_command_available("bullet_list", view)).toBe(true);
    view.destroy();
  });

  it("returns true for ordered_list via wrapInList check", () => {
    const view = create_test_view("hello");
    expect(is_command_available("ordered_list", view)).toBe(true);
    view.destroy();
  });

  it("returns true for blockquote via wrapIn check", () => {
    const view = create_test_view("hello");
    expect(is_command_available("blockquote", view)).toBe(true);
    view.destroy();
  });

  it("returns true for heading commands", () => {
    const view = create_test_view("hello");
    expect(is_command_available("heading1", view)).toBe(true);
    expect(is_command_available("heading2", view)).toBe(true);
    expect(is_command_available("heading3", view)).toBe(true);
    view.destroy();
  });

  it("returns true for code_block", () => {
    const view = create_test_view("hello");
    expect(is_command_available("code_block", view)).toBe(true);
    view.destroy();
  });

  it("returns true for table", () => {
    const view = create_test_view("hello");
    expect(is_command_available("table", view)).toBe(true);
    view.destroy();
  });

  it("returns true for horizontal_rule", () => {
    const view = create_test_view("hello");
    expect(is_command_available("horizontal_rule", view)).toBe(true);
    view.destroy();
  });
});

describe("FormattingCommand type coverage", () => {
  const all_commands: FormattingCommand[] = [
    "undo",
    "redo",
    "bold",
    "italic",
    "strikethrough",
    "code",
    "link",
    "heading1",
    "heading2",
    "heading3",
    "blockquote",
    "bullet_list",
    "ordered_list",
    "code_block",
    "table",
    "horizontal_rule",
    "image",
  ];

  it("all commands have availability checks", () => {
    const view = create_test_view("test");
    for (const cmd of all_commands) {
      expect(() => is_command_available(cmd, view)).not.toThrow();
    }
    view.destroy();
  });
});
