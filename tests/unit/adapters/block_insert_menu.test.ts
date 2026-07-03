/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import { create_commands } from "$lib/features/editor/adapters/slash_command_plugin";
import { block_insert_commands } from "$lib/features/editor/adapters/block_insert_menu";
import { insert_paragraph_below } from "$lib/features/editor/adapters/block_drag_handle_plugin";

function make_mock_view(initial: EditorState): {
  view: EditorView;
  get_state: () => EditorState;
} {
  let current = initial;
  const view = {
    get state() {
      return current;
    },
    dispatch(tr: import("prosemirror-state").Transaction) {
      current = current.apply(tr);
    },
    focus: vi.fn(),
  } as unknown as EditorView;
  return { view, get_state: () => current };
}

function find_command(id: string) {
  const cmd = create_commands().find((c) => c.id === id);
  if (!cmd) throw new Error(`command "${id}" not found`);
  return cmd;
}

function paragraph_start(doc: import("prosemirror-model").Node): number {
  let pos = 0;
  doc.forEach((node, offset) => {
    if (node.type.name === "paragraph") pos = offset;
  });
  return pos;
}

describe("block_insert_commands", () => {
  it("sources its command list from create_commands", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("x")),
    ]);
    const state = EditorState.create({ doc });

    const ids = block_insert_commands(state).map((c) => c.id);
    const expected = create_commands()
      .filter((c) => !c.is_available || c.is_available(state))
      .map((c) => c.id);

    expect(ids).toEqual(expected);
    expect(ids).toContain("h1");
    expect(ids).toContain("frontmatter");
  });

  it("omits commands unavailable in the current state", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.frontmatter.create(null),
      schema.nodes.paragraph.create(null, schema.text("x")),
    ]);
    const state = EditorState.create({ doc });

    expect(block_insert_commands(state).map((c) => c.id)).not.toContain(
      "frontmatter",
    );
  });
});

describe("block insert flow", () => {
  it("selecting a heading command converts the newly inserted block", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.heading.create({ level: 1 }, schema.text("Title")),
      schema.nodes.paragraph.create(null, schema.text("body")),
    ]);
    const { view, get_state } = make_mock_view(EditorState.create({ doc }));

    const from = insert_paragraph_below(view, paragraph_start(doc));
    expect(from).not.toBeNull();
    if (from == null) throw new Error("expected an inserted paragraph");

    expect(get_state().doc.resolve(from).parent.type.name).toBe("paragraph");

    find_command("h1").insert(view, from);

    const parent = get_state().doc.resolve(from).parent;
    expect(parent.type.name).toBe("heading");
    expect(parent.attrs["level"]).toBe(1);
  });
});
