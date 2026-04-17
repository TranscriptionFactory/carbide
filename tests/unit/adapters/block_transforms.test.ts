/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  create_turn_into_command,
  duplicate_block,
  delete_block,
} from "$lib/features/editor/adapters/block_transforms";

function make_doc(
  ...children: Parameters<typeof schema.nodes.doc.create>[1][]
) {
  return schema.nodes.doc.create(null, children as any);
}

function make_para(text?: string) {
  return schema.nodes.paragraph.create(
    null,
    text ? schema.text(text) : undefined,
  );
}

function make_heading(level: number, text?: string) {
  return schema.nodes.heading.create(
    { level, id: "" },
    text ? schema.text(text) : undefined,
  );
}

function make_blockquote(...children: any[]) {
  return schema.nodes.blockquote.create(null, children);
}

function make_bullet_list(...items: any[]) {
  return schema.nodes.bullet_list.create(null, items);
}

function make_ordered_list(...items: any[]) {
  return schema.nodes.ordered_list.create(null, items);
}

function make_list_item(text: string, attrs?: Record<string, unknown>) {
  return schema.nodes.list_item.create(attrs ?? null, [make_para(text)]);
}

function make_code_block(text?: string, language = "") {
  return schema.nodes.code_block.create(
    { language },
    text ? schema.text(text) : undefined,
  );
}

function make_callout(title_text: string, body_text: string) {
  const title = schema.nodes.callout_title.create(
    null,
    title_text ? schema.text(title_text) : undefined,
  );
  const body = schema.nodes.callout_body.create(null, [
    schema.nodes.paragraph.create(
      null,
      body_text ? schema.text(body_text) : undefined,
    ),
  ]);
  return schema.nodes.callout.create(
    { callout_type: "note", foldable: false, default_folded: false },
    [title, body],
  );
}

function make_state(doc: ReturnType<typeof make_doc>, cursor_pos = 1) {
  const state = EditorState.create({ doc, schema });
  if (cursor_pos > 0) {
    return state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, cursor_pos)),
    );
  }
  return state;
}

function make_view(state: EditorState) {
  const el = document.createElement("div");
  return new EditorView(el, { state });
}

function apply_command(
  state: EditorState,
  cmd: (s: EditorState, d?: (tr: any) => void) => boolean,
): { result: boolean; state: EditorState } {
  let new_state = state;
  const result = cmd(state, (tr) => {
    new_state = state.apply(tr);
  });
  return { result, state: new_state };
}

describe("turn_into", () => {
  it("paragraph → heading 1 preserves inline content", () => {
    const doc = make_doc(make_para("hello world"));
    const state = make_state(doc);
    const cmd = create_turn_into_command("heading", { level: 1 });
    const { result, state: after } = apply_command(state, cmd);

    expect(result).toBe(true);
    const first = after.doc.firstChild!;
    expect(first.type.name).toBe("heading");
    expect(first.attrs["level"]).toBe(1);
    expect(first.textContent).toBe("hello world");
  });

  it("paragraph → heading preserves marks (bold)", () => {
    const bold_text = schema.text("bold", [schema.marks.strong.create()]);
    const para = schema.nodes.paragraph.create(null, [bold_text]);
    const doc = make_doc(para);
    const state = make_state(doc);
    const cmd = create_turn_into_command("heading", { level: 2 });
    const { state: after } = apply_command(state, cmd);

    const heading = after.doc.firstChild!;
    expect(heading.type.name).toBe("heading");
    expect(heading.firstChild!.marks.length).toBe(1);
    expect(heading.firstChild!.marks[0]!.type.name).toBe("strong");
  });

  it("heading → paragraph preserves inline content", () => {
    const doc = make_doc(make_heading(1, "title text"));
    const state = make_state(doc);
    const cmd = create_turn_into_command("paragraph");
    const { result, state: after } = apply_command(state, cmd);

    expect(result).toBe(true);
    const first = after.doc.firstChild!;
    expect(first.type.name).toBe("paragraph");
    expect(first.textContent).toBe("title text");
  });

  it("heading 1 → heading 2 changes level", () => {
    const doc = make_doc(make_heading(1, "title"));
    const state = make_state(doc);
    const cmd = create_turn_into_command("heading", { level: 2 });
    const { result, state: after } = apply_command(state, cmd);

    expect(result).toBe(true);
    expect(after.doc.firstChild!.attrs["level"]).toBe(2);
  });

  it("paragraph → blockquote wraps correctly", () => {
    const doc = make_doc(make_para("quote me"));
    const state = make_state(doc);
    const cmd = create_turn_into_command("blockquote");
    const { result, state: after } = apply_command(state, cmd);

    expect(result).toBe(true);
    const first = after.doc.firstChild!;
    expect(first.type.name).toBe("blockquote");
    expect(first.firstChild!.textContent).toBe("quote me");
  });

  it("blockquote → paragraph lifts correctly", () => {
    const doc = make_doc(make_blockquote(make_para("unquote me")));
    const state = make_state(doc, 2);
    const cmd = create_turn_into_command("paragraph");
    const { result, state: after } = apply_command(state, cmd);

    expect(result).toBe(true);
    const first = after.doc.firstChild!;
    expect(first.type.name).toBe("paragraph");
    expect(first.textContent).toBe("unquote me");
  });

  it("paragraph → bullet_list creates list structure", () => {
    const doc = make_doc(make_para("list item"));
    const state = make_state(doc);
    const cmd = create_turn_into_command("bullet_list");
    const { result, state: after } = apply_command(state, cmd);

    expect(result).toBe(true);
    const first = after.doc.firstChild!;
    expect(first.type.name).toBe("bullet_list");
    expect(first.firstChild!.type.name).toBe("list_item");
    expect(first.firstChild!.firstChild!.textContent).toBe("list item");
  });

  it("paragraph → ordered_list creates list structure", () => {
    const doc = make_doc(make_para("numbered"));
    const state = make_state(doc);
    const cmd = create_turn_into_command("ordered_list");
    const { result, state: after } = apply_command(state, cmd);

    expect(result).toBe(true);
    const first = after.doc.firstChild!;
    expect(first.type.name).toBe("ordered_list");
  });

  it("paragraph → code_block converts correctly", () => {
    const doc = make_doc(make_para("code here"));
    const state = make_state(doc);
    const cmd = create_turn_into_command("code_block");
    const { result, state: after } = apply_command(state, cmd);

    expect(result).toBe(true);
    const first = after.doc.firstChild!;
    expect(first.type.name).toBe("code_block");
    expect(first.textContent).toBe("code here");
  });

  it("code_block → paragraph preserves text", () => {
    const doc = make_doc(make_code_block("some code"));
    const state = make_state(doc);
    const cmd = create_turn_into_command("paragraph");
    const { result, state: after } = apply_command(state, cmd);

    expect(result).toBe(true);
    expect(after.doc.firstChild!.type.name).toBe("paragraph");
    expect(after.doc.firstChild!.textContent).toBe("some code");
  });

  it("paragraph → callout creates correct structure", () => {
    const doc = make_doc(make_para("callout content"));
    const state = make_state(doc);
    const cmd = create_turn_into_command("callout");
    const { result, state: after } = apply_command(state, cmd);

    expect(result).toBe(true);
    const first = after.doc.firstChild!;
    expect(first.type.name).toBe("callout");
    expect(first.firstChild!.type.name).toBe("callout_title");
    expect(first.lastChild!.type.name).toBe("callout_body");
    expect(first.lastChild!.firstChild!.textContent).toBe("callout content");
  });

  it("no-op when target matches current type", () => {
    const doc = make_doc(make_para("unchanged"));
    const state = make_state(doc);
    const cmd = create_turn_into_command("paragraph");
    const { result } = apply_command(state, cmd);

    expect(result).toBe(false);
  });

  it("heading no-op when same level", () => {
    const doc = make_doc(make_heading(2, "same"));
    const state = make_state(doc);
    const cmd = create_turn_into_command("heading", { level: 2 });
    const { result } = apply_command(state, cmd);

    expect(result).toBe(false);
  });

  it("blockquote no-op when already blockquote", () => {
    const doc = make_doc(make_blockquote(make_para("in bq")));
    const state = make_state(doc, 2);
    const cmd = create_turn_into_command("blockquote");
    const { result } = apply_command(state, cmd);

    expect(result).toBe(false);
  });
});

describe("duplicate_block", () => {
  it("duplicates paragraph as identical sibling", () => {
    const doc = make_doc(make_para("original"));
    const state = make_state(doc);
    const { result, state: after } = apply_command(state, duplicate_block);

    expect(result).toBe(true);
    expect(after.doc.childCount).toBe(2);
    expect(after.doc.firstChild!.textContent).toBe("original");
    expect(after.doc.lastChild!.textContent).toBe("original");
  });

  it("duplicates heading with body (section)", () => {
    const doc = make_doc(
      make_heading(1, "Title"),
      make_para("body text"),
      make_heading(1, "Next"),
    );
    const state = make_state(doc);
    const { result, state: after } = apply_command(state, duplicate_block);

    expect(result).toBe(true);
    expect(after.doc.childCount).toBe(5);
    expect(after.doc.child(0).textContent).toBe("Title");
    expect(after.doc.child(1).textContent).toBe("body text");
    expect(after.doc.child(2).textContent).toBe("Title");
    expect(after.doc.child(3).textContent).toBe("body text");
    expect(after.doc.child(4).textContent).toBe("Next");
  });

  it("duplicates code block preserving language attr", () => {
    const doc = make_doc(make_code_block("fn main() {}", "rust"));
    const state = make_state(doc);
    const { result, state: after } = apply_command(state, duplicate_block);

    expect(result).toBe(true);
    expect(after.doc.childCount).toBe(2);
    expect(after.doc.lastChild!.attrs["language"]).toBe("rust");
    expect(after.doc.lastChild!.textContent).toBe("fn main() {}");
  });

  it("duplicates callout preserving structure", () => {
    const doc = make_doc(make_callout("Note", "Content"));
    const state = make_state(doc);
    const { result, state: after } = apply_command(state, duplicate_block);

    expect(result).toBe(true);
    expect(after.doc.childCount).toBe(2);
    const dupe = after.doc.lastChild!;
    expect(dupe.type.name).toBe("callout");
    expect(dupe.attrs["callout_type"]).toBe("note");
  });

  it("cursor moves to start of duplicated block", () => {
    const doc = make_doc(make_para("first"), make_para("second"));
    const state = make_state(doc);
    const { state: after } = apply_command(state, duplicate_block);

    const first_end = after.doc.firstChild!.nodeSize;
    expect(after.selection.from).toBe(first_end + 1);
  });
});

describe("delete_block", () => {
  it("deletes paragraph and positions cursor", () => {
    const doc = make_doc(make_para("first"), make_para("second"));
    const state = make_state(doc);
    const { result, state: after } = apply_command(state, delete_block);

    expect(result).toBe(true);
    expect(after.doc.childCount).toBe(1);
    expect(after.doc.firstChild!.textContent).toBe("second");
  });

  it("delete heading keeps children (body paragraphs)", () => {
    const doc = make_doc(
      make_heading(1, "Title"),
      make_para("body"),
      make_para("more body"),
    );
    const state = make_state(doc);
    const { result, state: after } = apply_command(state, delete_block);

    expect(result).toBe(true);
    expect(after.doc.childCount).toBe(2);
    expect(after.doc.firstChild!.textContent).toBe("body");
    expect(after.doc.lastChild!.textContent).toBe("more body");
  });

  it("deleting last block replaces with empty paragraph", () => {
    const doc = make_doc(make_para("only"));
    const state = make_state(doc);
    const { result, state: after } = apply_command(state, delete_block);

    expect(result).toBe(true);
    expect(after.doc.childCount).toBe(1);
    expect(after.doc.firstChild!.type.name).toBe("paragraph");
    expect(after.doc.firstChild!.textContent).toBe("");
  });

  it("deleting first of two blocks moves cursor to next", () => {
    const doc = make_doc(make_para("first"), make_para("second"));
    const cursor_pos = 1;
    const state = make_state(doc, cursor_pos);
    const { state: after } = apply_command(state, delete_block);

    expect(after.doc.childCount).toBe(1);
    expect(after.doc.firstChild!.textContent).toBe("second");
    expect(after.selection.from).toBeGreaterThanOrEqual(1);
  });
});
