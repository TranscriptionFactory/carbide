/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { build_copy_blocks_payload } from "$lib/features/editor/adapters/copy_blocks_payload";
import type { RichClipboardPayload } from "$lib/features/clipboard";

function make_doc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text("First block")),
    schema.nodes.paragraph.create(null, schema.text("Second block")),
  ]);
}

function make_view(
  props: Partial<ConstructorParameters<typeof EditorView>[1]> = {},
) {
  const el = document.createElement("div");
  const state = EditorState.create({ doc: make_doc(), schema });
  return new EditorView(el, { state, ...props });
}

function expect_payload(
  payload: RichClipboardPayload | null,
): RichClipboardPayload {
  expect(payload).not.toBeNull();
  return payload as RichClipboardPayload;
}

const second_block_pos = 13;

describe("build_copy_blocks_payload", () => {
  it("returns html tagged with data-pm-slice plus a text fallback", () => {
    const view = make_view();

    const payload = expect_payload(
      build_copy_blocks_payload(view, new Set([0, second_block_pos])),
    );

    expect(payload.html).toMatch(/data-pm-slice/i);
    expect(payload.html).toContain("First block");
    expect(payload.html).toContain("Second block");
    expect(payload.text).toContain("First block");
    expect(payload.text).toContain("Second block");
    view.destroy();
  });

  it("uses the view clipboardTextSerializer for the text payload", () => {
    const view = make_view({
      clipboardTextSerializer: () => "serialized markdown",
    });

    const payload = expect_payload(
      build_copy_blocks_payload(view, new Set([0])),
    );

    expect(payload.text).toBe("serialized markdown");
    expect(payload.html).toContain("First block");
    view.destroy();
  });

  it("orders blocks by document position regardless of set order", () => {
    const view = make_view();

    const payload = expect_payload(
      build_copy_blocks_payload(view, new Set([second_block_pos, 0])),
    );

    const first_index = payload.html.indexOf("First block");
    const second_index = payload.html.indexOf("Second block");
    expect(first_index).toBeGreaterThanOrEqual(0);
    expect(second_index).toBeGreaterThan(first_index);
    view.destroy();
  });

  it("returns null when no positions resolve to nodes", () => {
    const view = make_view();

    expect(build_copy_blocks_payload(view, new Set())).toBeNull();
    expect(
      build_copy_blocks_payload(view, new Set([view.state.doc.content.size])),
    ).toBeNull();
    view.destroy();
  });
});
