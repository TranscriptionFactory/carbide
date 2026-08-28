import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { Schema } from "prosemirror-model";
import {
  image_context_menu_plugin_key,
  create_image_context_menu_prose_plugin,
  image_pos_from_resolved,
  type ImageContextMenuState,
} from "$lib/features/editor/adapters/image_context_menu_plugin";
import { schema as editor_schema } from "$lib/features/editor/adapters/schema";

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

describe("image_pos_from_resolved", () => {
  it("returns the click position unchanged when no image ancestor exists", () => {
    const doc = editor_schema.nodes.doc.create(null, [
      editor_schema.nodes.paragraph.create(null, [
        editor_schema.text("a"),
        editor_schema.nodes.image.create({ src: "inline.png" }),
        editor_schema.text("b"),
      ]),
    ]);
    const resolved = doc.resolve(2);
    expect(resolved.depth).toBe(1);

    // Both image kinds in the editor schema are atom nodes, so a resolved
    // position never sits inside one — the click position itself is the
    // fallback the handler re-validates with nodeAt().
    const pos = image_pos_from_resolved(resolved);
    expect(pos).toBe(2);
    expect(doc.nodeAt(pos)?.type.name).toBe("image");
  });

  it("no-ops on a depth-0 resolved position instead of throwing", () => {
    const doc = editor_schema.nodes.doc.create(null, [
      editor_schema.nodes["image-block"].create({ src: "block.png" }),
    ]);
    const resolved = doc.resolve(0);
    expect(resolved.depth).toBe(0);

    expect(() => image_pos_from_resolved(resolved)).not.toThrow();
    expect(image_pos_from_resolved(resolved)).toBe(0);
    expect(doc.nodeAt(0)?.type.name).toBe("image-block");
  });
});
