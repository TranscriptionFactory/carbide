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
      bullet_list: {
        group: "block",
        content: "list_item+",
        toDOM: () => ["ul", 0] as const,
        parseDOM: [{ tag: "ul" }],
      },
      list_item: {
        attrs: { checked: { default: null } },
        content: "block+",
        toDOM: () => ["li", 0] as const,
        parseDOM: [{ tag: "li" }],
      },
      code_block: {
        group: "block",
        content: "text*",
        code: true,
        attrs: { language: { default: "" } },
        toDOM: () => ["pre", ["code", 0]] as const,
        parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
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

describe("slash task-list insertion", () => {
  it("replaces slash query with unchecked task list and places cursor in item", () => {
    const schema = create_schema();
    const paragraph = schema.nodes["paragraph"].create(
      null,
      schema.text("    /todo"),
    );
    const doc = schema.nodes["doc"].create(null, [paragraph]);
    const initial = EditorState.create({ doc });
    const state = initial.apply(
      initial.tr.setSelection(
        TextSelection.create(doc, 1 + "    /todo".length),
      ),
    );

    const dispatched: Array<import("prosemirror-state").Transaction> = [];
    const view = {
      state,
      dispatch: (tr: import("prosemirror-state").Transaction) =>
        dispatched.push(tr),
      focus: vi.fn(),
    } as unknown as import("prosemirror-view").EditorView;

    find_command("todo").insert(view, 1);

    expect(dispatched).toHaveLength(1);
    const tr = dispatched[0];
    if (!tr) throw new Error("expected todo insertion transaction");
    const first = tr.doc.firstChild;
    expect(first?.type.name).toBe("bullet_list");
    expect(first?.firstChild?.type.name).toBe("list_item");
    expect(first?.firstChild?.attrs["checked"]).toBe(false);

    expect(tr.selection.empty).toBe(true);
    expect(tr.selection.$from.parent.type.name).toBe("paragraph");
  });
});

describe("slash smart-block insertion", () => {
  function insert_via_slash(command_id: string) {
    const schema = create_schema();
    const trigger = `/${command_id}`;
    const paragraph = schema.nodes["paragraph"].create(
      null,
      schema.text(trigger),
    );
    const doc = schema.nodes["doc"].create(null, [paragraph]);
    const initial = EditorState.create({ doc });
    const state = initial.apply(
      initial.tr.setSelection(TextSelection.create(doc, 1 + trigger.length)),
    );

    const dispatched: Array<import("prosemirror-state").Transaction> = [];
    const view = {
      state,
      dispatch: (tr: import("prosemirror-state").Transaction) =>
        dispatched.push(tr),
      focus: vi.fn(),
    } as unknown as import("prosemirror-view").EditorView;

    find_command(command_id).insert(view, 1);
    const tr = dispatched[0];
    if (!tr) throw new Error(`expected ${command_id} insertion transaction`);
    return tr.doc.firstChild;
  }

  it.each([
    ["query", "query"],
    ["base", "base"],
    ["backlinks", "backlinks"],
    ["task-query", "tasks"],
  ])("inserts a %s code block with language %s", (command_id, language) => {
    const block = insert_via_slash(command_id);
    expect(block?.type.name).toBe("code_block");
    expect(block?.attrs["language"]).toBe(language);
  });

  it("inserts an empty backlinks block body", () => {
    const block = insert_via_slash("backlinks");
    expect(block?.textContent).toBe("");
  });
});
