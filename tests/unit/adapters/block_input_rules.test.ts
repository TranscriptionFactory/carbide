import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_block_input_rules_prose_plugin } from "$lib/features/editor/adapters/block_input_rules_plugin";

function make_state_with_plugin(text: string): EditorState {
  const plugin = create_block_input_rules_prose_plugin();
  const para = schema.nodes.paragraph.create(
    null,
    text.length > 0 ? schema.text(text) : [],
  );
  const doc = schema.nodes.doc.create(null, [para]);
  const state = EditorState.create({ doc, plugins: [plugin] });
  const pos = 1 + text.length;
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pos)),
  );
}

function trigger_input_rule(
  prefix: string,
  final_char: string,
): EditorState | null {
  const state = make_state_with_plugin(prefix);
  const plugin = state.plugins[0];
  const { from } = state.selection;

  let dispatched: Transaction | null = null;
  const mock_view = {
    state,
    dispatch(tr: Transaction) {
      dispatched = tr;
    },
  } as unknown as import("prosemirror-view").EditorView;

  const handled = plugin.props.handleTextInput?.(
    mock_view,
    from,
    from,
    final_char,
  );
  if (!handled || !dispatched) return null;

  return state.apply(dispatched);
}

describe("heading input rules", () => {
  it("# creates heading level 1", () => {
    const result = trigger_input_rule("#", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    expect(first?.type.name).toBe("heading");
    expect(first?.attrs["level"]).toBe(1);
  });

  it("## creates heading level 2", () => {
    const result = trigger_input_rule("##", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    expect(first?.type.name).toBe("heading");
    expect(first?.attrs["level"]).toBe(2);
  });

  it("### creates heading level 3", () => {
    const result = trigger_input_rule("###", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    expect(first?.type.name).toBe("heading");
    expect(first?.attrs["level"]).toBe(3);
  });

  it("#### creates heading level 4", () => {
    const result = trigger_input_rule("####", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    expect(first?.type.name).toBe("heading");
    expect(first?.attrs["level"]).toBe(4);
  });

  it("####### does not create heading (max 6 hashes)", () => {
    const result = trigger_input_rule("#######", " ");
    expect(result).toBeNull();
  });
});

describe("bullet list input rules", () => {
  it("- creates bullet list", () => {
    const result = trigger_input_rule("-", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    expect(first?.type.name).toBe("bullet_list");
    expect(first?.firstChild?.type.name).toBe("list_item");
  });

  it("* creates bullet list", () => {
    const result = trigger_input_rule("*", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    expect(first?.type.name).toBe("bullet_list");
  });
});

describe("ordered list input rule", () => {
  it("1. creates ordered list with order 1", () => {
    const result = trigger_input_rule("1.", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    expect(first?.type.name).toBe("ordered_list");
    expect(first?.attrs["order"]).toBe(1);
    expect(first?.firstChild?.type.name).toBe("list_item");
  });

  it("3. creates ordered list with order 3", () => {
    const result = trigger_input_rule("3.", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    expect(first?.type.name).toBe("ordered_list");
    expect(first?.attrs["order"]).toBe(3);
  });
});

describe("blockquote input rule", () => {
  it("> creates blockquote", () => {
    const result = trigger_input_rule(">", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    expect(first?.type.name).toBe("blockquote");
    expect(first?.firstChild?.type.name).toBe("paragraph");
  });
});

describe("horizontal rule input rule", () => {
  it("--- creates hr with trailing paragraph", () => {
    const result = trigger_input_rule("--", "-");
    expect(result).not.toBeNull();
    expect(result!.doc.childCount).toBe(2);
    expect(result!.doc.firstChild?.type.name).toBe("hr");
    expect(result!.doc.child(1).type.name).toBe("paragraph");
  });
});

describe("code block input rule", () => {
  it("``` creates code block", () => {
    const result = trigger_input_rule("``", "`");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    expect(first?.type.name).toBe("code_block");
  });
});

describe("task list input rules", () => {
  it("- [ ] creates unchecked task list item", () => {
    const result = trigger_input_rule("- [ ]", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    expect(first?.type.name).toBe("bullet_list");
    const item = first?.firstChild;
    expect(item?.type.name).toBe("list_item");
    expect(item?.attrs["checked"]).toBe(false);
  });

  it("- [x] creates checked task list item", () => {
    const result = trigger_input_rule("- [x]", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    const item = first?.firstChild;
    expect(item?.type.name).toBe("list_item");
    expect(item?.attrs["checked"]).toBe(true);
  });

  it("- [X] creates checked task list item (uppercase X)", () => {
    const result = trigger_input_rule("- [X]", " ");
    expect(result).not.toBeNull();
    const first = result!.doc.firstChild;
    const item = first?.firstChild;
    expect(item?.attrs["checked"]).toBe(true);
  });
});

describe("input rules regex patterns", () => {
  const heading_re = /^(#{1,6})\s$/;
  const bullet_re = /^\s*([-*])\s$/;
  const ordered_re = /^(\d+)\.\s$/;
  const blockquote_re = /^>\s$/;
  const hr_re = /^---$/;
  const code_block_re = /^```$/;
  const task_re = /^\s*-\s\[([ xX])\]\s$/;

  it("heading regex matches # through ######", () => {
    expect(heading_re.test("# ")).toBe(true);
    expect(heading_re.test("## ")).toBe(true);
    expect(heading_re.test("###### ")).toBe(true);
    expect(heading_re.test("####### ")).toBe(false);
    expect(heading_re.test("a ")).toBe(false);
  });

  it("bullet regex matches - and *", () => {
    expect(bullet_re.test("- ")).toBe(true);
    expect(bullet_re.test("* ")).toBe(true);
    expect(bullet_re.test("  - ")).toBe(true);
    expect(bullet_re.test("+ ")).toBe(false);
  });

  it("ordered regex matches digits followed by period and space", () => {
    expect(ordered_re.test("1. ")).toBe(true);
    expect(ordered_re.test("10. ")).toBe(true);
    expect(ordered_re.test("a. ")).toBe(false);
    expect(ordered_re.test("1 ")).toBe(false);
  });

  it("blockquote regex matches > with trailing space", () => {
    expect(blockquote_re.test("> ")).toBe(true);
    expect(blockquote_re.test(">")).toBe(false);
    expect(blockquote_re.test(">> ")).toBe(false);
  });

  it("hr regex matches exactly ---", () => {
    expect(hr_re.test("---")).toBe(true);
    expect(hr_re.test("----")).toBe(false);
    expect(hr_re.test("--")).toBe(false);
  });

  it("code block regex matches exactly ```", () => {
    expect(code_block_re.test("```")).toBe(true);
    expect(code_block_re.test("````")).toBe(false);
    expect(code_block_re.test("``")).toBe(false);
  });

  it("task list regex matches - [ ] and - [x] and - [X]", () => {
    expect(task_re.test("- [ ] ")).toBe(true);
    expect(task_re.test("- [x] ")).toBe(true);
    expect(task_re.test("- [X] ")).toBe(true);
    expect(task_re.test("- [y] ")).toBe(false);
    expect(task_re.test("-[] ")).toBe(false);
  });
});
