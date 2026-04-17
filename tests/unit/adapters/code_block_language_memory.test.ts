import { describe, expect, it, vi } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { create_commands } from "$lib/features/editor/adapters/slash_command_plugin";

function create_schema() {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: {
        group: "block",
        content: "inline*",
        toDOM: () => ["p", 0] as const,
        parseDOM: [{ tag: "p" }],
      },
      code_block: {
        group: "block",
        content: "text*",
        attrs: { language: { default: "" } },
        toDOM: () => ["pre", ["code", 0]] as const,
        parseDOM: [{ tag: "pre", preserveWhitespace: "full" as const }],
      },
      text: { group: "inline" },
    },
  });
}

function find_command(id: string) {
  const command = create_commands().find((cmd) => cmd.id === id);
  if (!command) throw new Error(`command "${id}" not found`);
  return command;
}

function find_code_block(
  doc: import("prosemirror-model").Node,
): { language: string } | null {
  let result: { language: string } | null = null;
  doc.descendants((node) => {
    if (node.type.name === "code_block" && result === null) {
      // skip pre-existing code blocks by checking if it's empty (newly inserted)
    }
    return true;
  });
  // Find the last code block — the newly created one via setBlockType
  for (let i = doc.childCount - 1; i >= 0; i--) {
    const child = doc.child(i);
    if (child.type.name === "code_block" && child.textContent === "") {
      result = { language: child.attrs["language"] as string };
      break;
    }
  }
  return result;
}

describe("code block language memory", () => {
  it("inherits language from last code block in doc", () => {
    const schema = create_schema();
    const doc = schema.nodes["doc"].create(null, [
      schema.nodes["code_block"].create(
        { language: "typescript" },
        schema.text("const x = 1;"),
      ),
      schema.nodes["paragraph"].create(null, schema.text("/code")),
    ]);
    const initial = EditorState.create({ doc });
    const para_start = doc.child(0).nodeSize + 1;
    const state = initial.apply(
      initial.tr.setSelection(TextSelection.create(doc, doc.content.size - 1)),
    );

    const dispatched: Array<import("prosemirror-state").Transaction> = [];
    const view = {
      state,
      dispatch: (tr: import("prosemirror-state").Transaction) =>
        dispatched.push(tr),
      focus: vi.fn(),
    } as unknown as import("prosemirror-view").EditorView;

    find_command("code").insert(view, para_start);

    expect(dispatched).toHaveLength(1);
    const new_code = find_code_block(dispatched[0]!.doc);
    expect(new_code).not.toBeNull();
    expect(new_code!.language).toBe("typescript");
  });

  it("defaults to empty string when no prior code block", () => {
    const schema = create_schema();
    const doc = schema.nodes["doc"].create(null, [
      schema.nodes["paragraph"].create(null, schema.text("/code")),
    ]);
    const initial = EditorState.create({ doc });
    const state = initial.apply(
      initial.tr.setSelection(TextSelection.create(doc, doc.content.size - 1)),
    );

    const dispatched: Array<import("prosemirror-state").Transaction> = [];
    const view = {
      state,
      dispatch: (tr: import("prosemirror-state").Transaction) =>
        dispatched.push(tr),
      focus: vi.fn(),
    } as unknown as import("prosemirror-view").EditorView;

    find_command("code").insert(view, 1);

    expect(dispatched).toHaveLength(1);
    const tr = dispatched[0]!;
    const new_block = tr.doc.firstChild;
    expect(new_block?.type.name).toBe("code_block");
    expect(new_block?.attrs["language"]).toBe("");
  });

  it("uses language from the last code block when multiple exist", () => {
    const schema = create_schema();
    const doc = schema.nodes["doc"].create(null, [
      schema.nodes["code_block"].create(
        { language: "python" },
        schema.text("print('hello')"),
      ),
      schema.nodes["code_block"].create(
        { language: "rust" },
        schema.text("fn main() {}"),
      ),
      schema.nodes["paragraph"].create(null, schema.text("/code")),
    ]);
    const initial = EditorState.create({ doc });
    const state = initial.apply(
      initial.tr.setSelection(TextSelection.create(doc, doc.content.size - 1)),
    );

    const dispatched: Array<import("prosemirror-state").Transaction> = [];
    const view = {
      state,
      dispatch: (tr: import("prosemirror-state").Transaction) =>
        dispatched.push(tr),
      focus: vi.fn(),
    } as unknown as import("prosemirror-view").EditorView;

    const para_start = doc.child(0).nodeSize + doc.child(1).nodeSize + 1;
    find_command("code").insert(view, para_start);

    expect(dispatched).toHaveLength(1);
    const new_code = find_code_block(dispatched[0]!.doc);
    expect(new_code).not.toBeNull();
    expect(new_code!.language).toBe("rust");
  });
});
