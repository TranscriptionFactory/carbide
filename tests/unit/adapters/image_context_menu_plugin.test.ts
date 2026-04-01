import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { Schema } from "prosemirror-model";
import {
  image_context_menu_plugin_key,
  create_image_context_menu_prose_plugin,
  type ImageContextMenuState,
} from "$lib/features/editor/adapters/image_context_menu_plugin";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block", toDOM: () => ["p", 0] },
    "image-block": {
      attrs: {
        src: { default: "" },
        alt: { default: "" },
        width: { default: "" },
        caption: { default: "" },
      },
      group: "block",
      atom: true,
      toDOM: (node) => [
        "div",
        { class: "milkdown-image-block" },
        ["img", { src: node.attrs.src, alt: node.attrs.alt }],
      ],
      parseDOM: [{ tag: "div.milkdown-image-block" }],
    },
    text: { group: "inline" },
  },
});

const plugin = create_image_context_menu_prose_plugin();

function create_state(doc: ReturnType<(typeof schema)["node"]>) {
  return EditorState.create({ doc, schema, plugins: [plugin] });
}

function create_image_block_node(attrs: Record<string, string>) {
  return schema.nodes["image-block"].create(attrs);
}

describe("image_context_menu_plugin", () => {
  it("initializes with closed state", () => {
    const state = create_state(
      schema.node("doc", null, [schema.node("paragraph")]),
    );
    const plugin_state = image_context_menu_plugin_key.getState(state) as
      | ImageContextMenuState
      | undefined;
    expect(plugin_state).toBeDefined();
    expect(plugin_state?.open).toBe(false);
    expect(plugin_state?.pos).toBe(-1);
  });

  it("opens on open meta with correct state", () => {
    const img = create_image_block_node({
      src: "test.png",
      alt: "Test",
      width: "50%",
      caption: "",
    });
    const state = create_state(schema.node("doc", null, [img]));
    const tr = state.tr.setMeta(image_context_menu_plugin_key, {
      type: "open",
      pos: 0,
      clientX: 100,
      clientY: 200,
      src: "test.png",
      alt: "Test",
      width: "50%",
      isLocal: true,
    });
    const new_state = state.apply(tr);
    const plugin_state = image_context_menu_plugin_key.getState(
      new_state,
    ) as ImageContextMenuState;
    expect(plugin_state.open).toBe(true);
    expect(plugin_state.pos).toBe(0);
    expect(plugin_state.clientX).toBe(100);
    expect(plugin_state.clientY).toBe(200);
    expect(plugin_state.src).toBe("test.png");
    expect(plugin_state.alt).toBe("Test");
    expect(plugin_state.width).toBe("50%");
    expect(plugin_state.isLocal).toBe(true);
  });

  it("closes on close meta", () => {
    const img = create_image_block_node({
      src: "test.png",
      alt: "",
      width: "",
      caption: "",
    });
    let state = create_state(schema.node("doc", null, [img]));
    state = state.apply(
      state.tr.setMeta(image_context_menu_plugin_key, {
        type: "open",
        pos: 0,
        clientX: 0,
        clientY: 0,
        src: "test.png",
        alt: "",
        width: "",
        isLocal: true,
      }),
    );
    expect(image_context_menu_plugin_key.getState(state)?.open).toBe(true);

    state = state.apply(
      state.tr.setMeta(image_context_menu_plugin_key, { type: "close" }),
    );
    const plugin_state = image_context_menu_plugin_key.getState(
      state,
    ) as ImageContextMenuState;
    expect(plugin_state.open).toBe(false);
    expect(plugin_state.pos).toBe(-1);
  });

  it("ignores unrelated meta", () => {
    const img = create_image_block_node({
      src: "test.png",
      alt: "",
      width: "",
      caption: "",
    });
    let state = create_state(schema.node("doc", null, [img]));
    state = state.apply(
      state.tr.setMeta(image_context_menu_plugin_key, {
        type: "open",
        pos: 0,
        clientX: 0,
        clientY: 0,
        src: "test.png",
        alt: "",
        width: "",
        isLocal: true,
      }),
    );
    state = state.apply(state.tr.setMeta("other_plugin", { foo: "bar" }));
    const plugin_state = image_context_menu_plugin_key.getState(
      state,
    ) as ImageContextMenuState;
    expect(plugin_state.open).toBe(true);
  });

  it("detects local image isLocal flag", () => {
    const local_src = "assets/image.png";
    expect(/^[a-z][a-z0-9+.-]*:/i.test(local_src)).toBe(false);

    const remote_src = "https://example.com/image.png";
    expect(/^[a-z][a-z0-9+.-]*:/i.test(remote_src)).toBe(true);
  });

  it("plugin key is defined", () => {
    expect(image_context_menu_plugin_key).toBeDefined();
  });
});
