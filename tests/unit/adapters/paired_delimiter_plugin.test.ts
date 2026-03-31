import { describe, expect, it } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { create_paired_delimiter_prose_plugin } from "$lib/features/editor/adapters/paired_delimiter_plugin";
import { describe_suggestion_location } from "$lib/features/editor/adapters/wiki_suggest_plugin";
import { schema as editor_schema } from "$lib/features/editor/adapters/schema";

function create_schema() {
  const doc = { content: "block+" } as const;
  const text = { group: "inline" } as const;
  const paragraph = {
    group: "block",
    content: "inline*",
    toDOM: () => ["p", 0] as const,
    parseDOM: [{ tag: "p" }],
  } as const;
  const code_block = {
    group: "block",
    content: "text*",
    code: true,
    marks: "",
    toDOM: () => ["pre", ["code", 0]] as const,
    parseDOM: [{ tag: "pre" }],
  } as const;

  return new Schema({
    nodes: { doc, paragraph, code_block, text },
    marks: {},
  });
}

function create_view(state: EditorState) {
  return {
    state,
    dispatch(tr) {
      this.state = this.state.apply(tr);
    },
  } as EditorView & { state: EditorState };
}

function call_handle_text_input(
  plugin: ReturnType<typeof create_paired_delimiter_prose_plugin>,
  view: EditorView,
  from: number,
  to: number,
  text: string,
) {
  const handle_text_input = plugin.props.handleTextInput;
  if (!handle_text_input) {
    throw new Error("Expected handleTextInput");
  }

  return (
    handle_text_input as (
      this: typeof plugin,
      view: EditorView,
      from: number,
      to: number,
      text: string,
    ) => boolean
  ).call(plugin, view, from, to, text);
}

describe("create_paired_delimiter_prose_plugin", () => {
  it("waits for a second opening bracket before expanding a wiki link", () => {
    const schema = create_schema();
    const plugin = create_paired_delimiter_prose_plugin();
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [schema.node("paragraph", null, [])]),
      plugins: [plugin],
    });
    const view = create_view(state);

    expect(call_handle_text_input(plugin, view, 1, 1, "[")).toBe(true);
    expect(
      view.state.doc.textBetween(1, view.state.doc.content.size, "\n"),
    ).toBe("[");
    expect(view.state.selection.from).toBe(2);

    expect(
      call_handle_text_input(
        plugin,
        view,
        view.state.selection.from,
        view.state.selection.to,
        "[",
      ),
    ).toBe(true);
    expect(
      view.state.doc.textBetween(1, view.state.doc.content.size, "\n"),
    ).toBe("[[]]");
    expect(view.state.selection.from).toBe(3);
  });

  it("skips over an existing closing bracket instead of duplicating it", () => {
    const schema = create_schema();
    const plugin = create_paired_delimiter_prose_plugin();
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [schema.node("paragraph", null, [])]),
      plugins: [plugin],
    });
    const view = create_view(state);

    call_handle_text_input(plugin, view, 1, 1, "[");
    call_handle_text_input(
      plugin,
      view,
      view.state.selection.from,
      view.state.selection.to,
      "[",
    );

    expect(
      call_handle_text_input(
        plugin,
        view,
        view.state.selection.from,
        view.state.selection.to,
        "]",
      ),
    ).toBe(true);
    expect(
      view.state.doc.textBetween(1, view.state.doc.content.size, "\n"),
    ).toBe("[[]]");
    expect(view.state.selection.from).toBe(4);
  });

  it("wraps text selections with paired delimiters", () => {
    const schema = create_schema();
    const plugin = create_paired_delimiter_prose_plugin();
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("note")]),
      ]),
      plugins: [plugin],
    });
    const view = create_view(
      state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 5))),
    );

    expect(call_handle_text_input(plugin, view, 1, 5, "(")).toBe(true);
    expect(
      view.state.doc.textBetween(1, view.state.doc.content.size, "\n"),
    ).toBe("(note)");
    expect(view.state.selection.from).toBe(6);
  });

  it("wraps selection with backtick delimiters", () => {
    const schema = create_schema();
    const plugin = create_paired_delimiter_prose_plugin();
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("hello")]),
      ]),
      plugins: [plugin],
    });
    const view = create_view(
      state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6))),
    );

    expect(call_handle_text_input(plugin, view, 1, 6, "`")).toBe(true);
    expect(
      view.state.doc.textBetween(1, view.state.doc.content.size, "\n"),
    ).toBe("`hello`");
    expect(view.state.selection.from).toBe(7);
  });

  it("wraps selection with asterisk delimiters", () => {
    const schema = create_schema();
    const plugin = create_paired_delimiter_prose_plugin();
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("world")]),
      ]),
      plugins: [plugin],
    });
    const view = create_view(
      state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6))),
    );

    expect(call_handle_text_input(plugin, view, 1, 6, "*")).toBe(true);
    expect(
      view.state.doc.textBetween(1, view.state.doc.content.size, "\n"),
    ).toBe("*world*");
    expect(view.state.selection.from).toBe(7);
  });

  it("applies strikethrough mark when tilde typed with selection", () => {
    const plugin = create_paired_delimiter_prose_plugin();
    const state = EditorState.create({
      schema: editor_schema,
      doc: editor_schema.node("doc", null, [
        editor_schema.node("paragraph", null, [editor_schema.text("strike")]),
      ]),
      plugins: [plugin],
    });
    const view = create_view(
      state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 7))),
    );

    expect(call_handle_text_input(plugin, view, 1, 7, "~")).toBe(true);
    expect(
      view.state.doc.textBetween(1, view.state.doc.content.size, "\n"),
    ).toBe("strike");
    const has_strikethrough = view.state.doc.rangeHasMark(
      1,
      7,
      editor_schema.marks.strikethrough,
    );
    expect(has_strikethrough).toBe(true);
    expect(view.state.selection.from).toBe(1);
    expect(view.state.selection.to).toBe(7);
  });

  it("does not wrap with formatting delimiters when no selection", () => {
    const schema = create_schema();
    const plugin = create_paired_delimiter_prose_plugin();
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("text")]),
      ]),
      plugins: [plugin],
    });
    const view = create_view(state);

    expect(call_handle_text_input(plugin, view, 1, 1, "`")).toBe(false);
    expect(call_handle_text_input(plugin, view, 1, 1, "*")).toBe(false);
    expect(call_handle_text_input(plugin, view, 1, 1, "~")).toBe(false);
  });

  it("converts multi-block selection to code block when typing backtick", () => {
    const schema = create_schema();
    const plugin = create_paired_delimiter_prose_plugin();
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("line one")]),
        schema.node("paragraph", null, [schema.text("line two")]),
      ]),
      plugins: [plugin],
    });
    const view = create_view(
      state.apply(
        state.tr.setSelection(
          TextSelection.create(
            state.doc,
            1,
            1 + "line one".length + 1 + 1 + "line two".length,
          ),
        ),
      ),
    );

    expect(
      call_handle_text_input(
        plugin,
        view,
        view.state.selection.from,
        view.state.selection.to,
        "`",
      ),
    ).toBe(true);
    expect(view.state.doc.firstChild?.type.name).toBe("code_block");
    expect(view.state.doc.firstChild?.textContent).toBe("line one\nline two");
  });

  it("still wraps single-line selection with inline backticks", () => {
    const schema = create_schema();
    const plugin = create_paired_delimiter_prose_plugin();
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("hello world")]),
      ]),
      plugins: [plugin],
    });
    const view = create_view(
      state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6))),
    );

    expect(call_handle_text_input(plugin, view, 1, 6, "`")).toBe(true);
    expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
    expect(
      view.state.doc.textBetween(1, view.state.doc.content.size, "\n"),
    ).toBe("`hello` world");
  });

  it("does not pair delimiters inside code blocks", () => {
    const schema = create_schema();
    const plugin = create_paired_delimiter_prose_plugin();
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [schema.node("code_block", null, [])]),
      plugins: [plugin],
    });
    const view = create_view(state);

    expect(call_handle_text_input(plugin, view, 1, 1, "[")).toBe(false);
    expect(
      view.state.doc.textBetween(1, view.state.doc.content.size, "\n"),
    ).toBe("");
  });
});

describe("describe_suggestion_location", () => {
  it("returns the enclosing folder or vault root", () => {
    expect(describe_suggestion_location("docs/specs/note.md")).toBe(
      "docs/specs",
    );
    expect(describe_suggestion_location("note.md")).toBe("Vault root");
  });
});
