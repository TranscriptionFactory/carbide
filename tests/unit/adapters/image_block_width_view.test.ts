/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_image_extension } from "$lib/features/editor/extensions/image_extension";
import type { PluginContext } from "$lib/features/editor/extensions/types";

const open_views: EditorView[] = [];

afterEach(() => {
  for (const view of open_views.splice(0)) view.destroy();
  document.body.innerHTML = "";
});

function mount_image_block(width: string): EditorView {
  const ctx: PluginContext = {
    events: { on_markdown_change: () => {}, on_dirty_state_change: () => {} },
    get_note_path: () => "note.md",
    get_vault_id: () => null,
    get_markdown: () => "",
    resolve_asset_url_for_vault: null,
  };
  const doc = schema.nodes.doc.create(null, [
    schema.nodes["image-block"]!.create({ src: "https://x/a.png", width }),
    schema.nodes.paragraph.create(),
  ]);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const view = new EditorView(container, {
    state: EditorState.create({
      schema,
      doc,
      plugins: create_image_extension(ctx).plugins,
    }),
  });
  open_views.push(view);
  return view;
}

function wrapper_width(view: EditorView): string {
  const wrapper = view.dom.querySelector<HTMLElement>(".image-wrapper");
  if (!wrapper) throw new Error("image-wrapper not rendered");
  return wrapper.style.width;
}

describe("image-block node view width", () => {
  it("renders the stored width on the wrapper", () => {
    const view = mount_image_block("320px");
    expect(wrapper_width(view)).toBe("320px");
  });

  it("applies a width attr change without recreating the wrapper", () => {
    const view = mount_image_block("320px");
    const before = view.dom.querySelector(".image-wrapper");
    const node = view.state.doc.nodeAt(0)!;
    view.dispatch(
      view.state.tr.setNodeMarkup(0, undefined, {
        ...node.attrs,
        width: "50%",
      }),
    );
    expect(view.dom.querySelector(".image-wrapper")).toBe(before);
    expect(wrapper_width(view)).toBe("50%");
  });

  it("clears the wrapper width when the attr is removed", () => {
    const view = mount_image_block("320px");
    const node = view.state.doc.nodeAt(0)!;
    view.dispatch(
      view.state.tr.setNodeMarkup(0, undefined, { ...node.attrs, width: "" }),
    );
    expect(wrapper_width(view)).toBe("");
  });
});
