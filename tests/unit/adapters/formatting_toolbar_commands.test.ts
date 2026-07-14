/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import {
  get_active_marks,
  is_command_available,
  is_block_command_active,
  link_selection_state,
  apply_link,
  toggle_format,
  type FormattingCommand,
} from "$lib/features/editor/adapters/formatting_toolbar_commands";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";

function mount_view(doc: ProseNode, selection?: TextSelection): EditorView {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const state = EditorState.create(
    selection ? { doc, plugins: [], selection } : { doc, plugins: [] },
  );
  return new EditorView(container, { state });
}

function create_test_view(doc_text: string): EditorView {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text(doc_text)),
  ]);
  return mount_view(doc);
}

function create_code_block_view(): EditorView {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.code_block.create(null, schema.text("const x = 1;")),
  ]);
  return mount_view(doc, TextSelection.create(doc, 3));
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

  it("returns false for link with collapsed selection", () => {
    const view = create_test_view("hello");
    expect(is_command_available("link", view)).toBe(false);
    view.destroy();
  });

  it("returns true for image always", () => {
    const view = create_test_view("hello");
    expect(is_command_available("image", view)).toBe(true);
    view.destroy();
  });

  it("returns true for link with a non-empty selection", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("hello world")),
    ]);
    const view = mount_view(doc, TextSelection.create(doc, 1, 6));
    expect(is_command_available("link", view)).toBe(true);
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

  it("disables mark commands inside a code block", () => {
    const view = create_code_block_view();
    expect(is_command_available("bold", view)).toBe(false);
    expect(is_command_available("italic", view)).toBe(false);
    expect(is_command_available("strikethrough", view)).toBe(false);
    expect(is_command_available("code", view)).toBe(false);
    view.destroy();
  });

  it("keeps marks enabled outside a code block", () => {
    const view = create_test_view("hello");
    expect(is_command_available("bold", view)).toBe(true);
    expect(is_command_available("italic", view)).toBe(true);
    view.destroy();
  });
});

describe("execute_command via toggle_format", () => {
  it("toggles bold on a selection", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("hello world")),
    ]);
    const view = mount_view(doc, TextSelection.create(doc, 1, 6));
    const applied = toggle_format("bold", view);
    expect(applied).toBe(true);
    expect(view.state.doc.rangeHasMark(1, 6, schema.marks.strong)).toBe(true);
    view.destroy();
  });

  it("sets a heading block type", () => {
    const view = create_test_view("hello");
    const applied = toggle_format("heading1", view);
    expect(applied).toBe(true);
    const first_child = view.state.doc.firstChild;
    expect(first_child?.type.name).toBe("heading");
    expect(first_child?.attrs["level"]).toBe(1);
    view.destroy();
  });

  it("inserts a table node", () => {
    const view = create_test_view("hello");
    const applied = toggle_format("table", view);
    expect(applied).toBe(true);
    let has_table = false;
    view.state.doc.descendants((node) => {
      if (node.type.name === "table") has_table = true;
    });
    expect(has_table).toBe(true);
    view.destroy();
  });

  it("applies a link mark to a selection", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("hello world")),
    ]);
    const view = mount_view(doc, TextSelection.create(doc, 1, 6));
    apply_link(view, "https://example.com");
    expect(view.state.doc.rangeHasMark(1, 6, schema.marks.link)).toBe(true);
    view.destroy();
  });

  it("updates an existing link's href from a collapsed cursor", () => {
    const link_text = schema.text("carbide", [
      schema.marks.link.create({ href: "https://old.example" }),
    ]);
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [link_text]),
    ]);
    const view = mount_view(doc, TextSelection.create(doc, 3));
    apply_link(view, "https://new.example");
    let href: string | null = null;
    view.state.doc.descendants((node) => {
      const mark = node.marks.find((m) => m.type === schema.marks.link);
      if (mark) href = String(mark.attrs["href"]);
    });
    expect(href).toBe("https://new.example");
    view.destroy();
  });
});

describe("is_block_command_active", () => {
  it("detects an active heading level", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.heading.create({ level: 2 }, schema.text("Title")),
    ]);
    const view = mount_view(doc, TextSelection.create(doc, 2));
    expect(is_block_command_active("heading2", view)).toBe(true);
    expect(is_block_command_active("heading1", view)).toBe(false);
    view.destroy();
  });

  it("detects an active code block", () => {
    const view = create_code_block_view();
    expect(is_block_command_active("code_block", view)).toBe(true);
    view.destroy();
  });

  it("detects an active blockquote", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.blockquote.create(null, [
        schema.nodes.paragraph.create(null, schema.text("quoted")),
      ]),
    ]);
    const view = mount_view(doc, TextSelection.create(doc, 3));
    expect(is_block_command_active("blockquote", view)).toBe(true);
    view.destroy();
  });

  it("returns false for a plain paragraph", () => {
    const view = create_test_view("plain");
    expect(is_block_command_active("blockquote", view)).toBe(false);
    expect(is_block_command_active("heading1", view)).toBe(false);
    view.destroy();
  });
});

describe("link_selection_state", () => {
  it("is not editable with a collapsed selection and no link", () => {
    const view = create_test_view("hello");
    const state = link_selection_state(view);
    expect(state.can_edit).toBe(false);
    expect(state.existing_href).toBe(null);
    view.destroy();
  });

  it("is editable with a non-empty selection", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("hello world")),
    ]);
    const view = mount_view(doc, TextSelection.create(doc, 1, 6));
    expect(link_selection_state(view).can_edit).toBe(true);
    view.destroy();
  });

  it("pre-fills the existing href when the cursor is inside a link", () => {
    const link_text = schema.text("carbide", [
      schema.marks.link.create({ href: "https://carbide.dev" }),
    ]);
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [link_text]),
    ]);
    const view = mount_view(doc, TextSelection.create(doc, 3));
    const state = link_selection_state(view);
    expect(state.can_edit).toBe(true);
    expect(state.existing_href).toBe("https://carbide.dev");
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
