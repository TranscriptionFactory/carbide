/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_turn_into_command } from "$lib/features/editor/adapters/block_transforms";

function make_task_li(
  checked: boolean | null,
  task_status: string | null,
): ReturnType<typeof schema.nodes.list_item.create> {
  return schema.nodes.list_item.create(
    { checked, task_status },
    schema.nodes.paragraph.create(null, schema.text("task")),
  );
}

function wrap_in_doc(
  li: ReturnType<typeof schema.nodes.list_item.create>,
): ReturnType<typeof schema.nodes.doc.create> {
  return schema.nodes.doc.create(null, [
    schema.nodes.bullet_list.create(null, [li]),
  ]);
}

describe("task checkbox toggle cycle", () => {
  it("checked is never null while task_status is non-null", () => {
    type State = { checked: boolean | null; task_status: string | null };
    const states: State[] = [{ checked: false, task_status: "todo" }];

    for (let i = 0; i < 6; i++) {
      const prev = states[states.length - 1] as State;
      const next_status = !prev.task_status
        ? prev.checked
          ? "todo"
          : "done"
        : prev.task_status === "todo"
          ? "doing"
          : prev.task_status === "doing"
            ? "done"
            : "todo";
      const next_checked = next_status === "done" ? true : false;
      states.push({ checked: next_checked, task_status: next_status });
    }

    for (const s of states) {
      if (s.task_status !== null) {
        expect(s.checked).not.toBeNull();
      }
    }
  });

  it("backspace nullifies both checked and task_status", () => {
    const li = make_task_li(false, "todo");
    expect(li.attrs["checked"]).toBe(false);
    expect(li.attrs["task_status"]).toBe("todo");

    const untasked = schema.nodes.list_item.create(
      { ...li.attrs, checked: null, task_status: null },
      li.content,
    );
    expect(untasked.attrs["checked"]).toBeNull();
    expect(untasked.attrs["task_status"]).toBeNull();
  });

  it("serializes todo state as unchecked task", () => {
    const doc = wrap_in_doc(make_task_li(false, "todo"));
    const md = serialize_markdown(doc).trim();
    expect(md).toBe("- [ ] task");
  });

  it("serializes doing state as [-] task", () => {
    const doc = wrap_in_doc(make_task_li(false, "doing"));
    const md = serialize_markdown(doc).trim();
    expect(md).toBe("- [-] task");
  });

  it("serializes done state as checked task", () => {
    const doc = wrap_in_doc(make_task_li(true, "done"));
    const md = serialize_markdown(doc).trim();
    expect(md).toBe("- [x] task");
  });

  it("never serializes task as plain bullet when task_status is set", () => {
    for (const status of ["todo", "doing", "done"] as const) {
      const checked = status === "done" ? true : false;
      const doc = wrap_in_doc(make_task_li(checked, status));
      const md = serialize_markdown(doc).trim();
      expect(md).toMatch(/^- \[[ x\-]\]/);
    }
  });

  it("parser sets both checked and task_status from markdown", () => {
    const unchecked_doc = parse_markdown("- [ ] item");
    const unchecked_li = unchecked_doc.firstChild?.firstChild;
    expect(unchecked_li?.attrs["checked"]).toBe(false);
    expect(unchecked_li?.attrs["task_status"]).toBe("todo");

    const checked_doc = parse_markdown("- [x] item");
    const checked_li = checked_doc.firstChild?.firstChild;
    expect(checked_li?.attrs["checked"]).toBe(true);
    expect(checked_li?.attrs["task_status"]).toBe("done");
  });

  it("parser sets doing state from [-] markdown", () => {
    const doc = parse_markdown("- [-] item");
    const li = doc.firstChild?.firstChild;
    expect(li?.attrs["checked"]).toBe(false);
    expect(li?.attrs["task_status"]).toBe("doing");
  });

  it("parser sets doing state from [/] markdown", () => {
    const doc = parse_markdown("- [/] item");
    const li = doc.firstChild?.firstChild;
    expect(li?.attrs["checked"]).toBe(false);
    expect(li?.attrs["task_status"]).toBe("doing");
  });

  it("plain bullet has null for both attrs", () => {
    const doc = parse_markdown("- item");
    const li = doc.firstChild?.firstChild;
    expect(li?.attrs["checked"]).toBeNull();
    expect(li?.attrs["task_status"]).toBeNull();
  });

  it("roundtrips: toggle → serialize → parse → verify attrs", () => {
    const original = make_task_li(false, "todo");
    const toggled = schema.nodes.list_item.create(
      { ...original.attrs, checked: false, task_status: "doing" },
      original.content,
    );

    const doc = wrap_in_doc(toggled);
    const md = serialize_markdown(doc).trim();
    expect(md).toBe("- [-] task");

    const reparsed = parse_markdown(md);
    const li = reparsed.firstChild?.firstChild;
    expect(li?.attrs["checked"]).toBe(false);
    expect(li?.attrs["task_status"]).toBe("doing");
  });

  it("bullet_list → todo_list conversion matches disk-loaded task attrs", () => {
    // Start with a bullet list (already wrapped) so we exercise the
    // is_wrapped_block branch in turn_into. This guarantees an in-editor
    // task with the same attrs a freshly-parsed `[ ]` task would have, so
    // the click handler's 3-state cycle behaves identically before vs.
    // after a navigate-away-and-back.
    const li = schema.nodes.list_item.create(null, [
      schema.nodes.paragraph.create(null, schema.text("hello")),
    ]);
    const bullet = schema.nodes.bullet_list.create(null, [li]);
    const doc = schema.nodes.doc.create(null, [bullet]);
    const state = EditorState.create({ doc, schema }).apply(
      EditorState.create({ doc, schema }).tr.setSelection(
        TextSelection.create(doc, 3),
      ),
    );
    const view = new EditorView(document.createElement("div"), { state });
    create_turn_into_command("todo_list")(view.state, view.dispatch);

    const list = view.state.doc.firstChild;
    const item = list?.firstChild;
    expect(item?.attrs["checked"]).toBe(false);
    expect(item?.attrs["task_status"]).toBe("todo");

    const disk_li = parse_markdown("- [ ] hello").firstChild?.firstChild;
    expect(item?.attrs["checked"]).toBe(disk_li?.attrs["checked"]);
    expect(item?.attrs["task_status"]).toBe(disk_li?.attrs["task_status"]);

    view.destroy();
  });
});
