/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { DOMParser, DOMSerializer } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import { create_excalidraw_embed_view_plugin } from "$lib/features/editor/adapters/excalidraw_embed_view_plugin";
import { create_code_block_view_prose_plugin } from "$lib/features/editor/adapters/code_block_view_plugin";
import { create_image_extension } from "$lib/features/editor/extensions/image_extension";
import type { PluginContext } from "$lib/features/editor/extensions/types";
import { PREVIEW_HEIGHT_MESSAGE } from "$lib/features/editor/adapters/code_preview";
import { double_click, drag_handle, stub_rect } from "../helpers/resize_drag";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
}));

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

async function open_note(markdown: string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const port = create_prosemirror_editor_port({
    note_embed: {
      read_note: vi.fn().mockResolvedValue("embedded content"),
      subscribe_to_changes: () => vi.fn(),
    },
  });
  const session = await port.start_session({
    root,
    initial_markdown: markdown,
    note_path: "host.md",
    vault_id: null,
    syntax_reveal_enabled: true,
    events: {
      on_markdown_change: vi.fn(),
      on_dirty_state_change: vi.fn(),
      on_cursor_change: vi.fn(),
      on_selection_change: vi.fn(),
    },
  });
  cleanups.push(() => {
    session.destroy();
  });
  return { root, session };
}

function query(root: ParentNode, selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

describe("note embed resize", () => {
  it("persists a dragged height and restores it on reopen", async () => {
    const { root, session } = await open_note("![[note]]\n");
    const content = query(root, ".note-embed__content");
    stub_rect(content, { width: 600, height: 120 });

    drag_handle(query(root, ".note-embed .embed-resize-handle"), "y", 0, 180);

    expect(session.get_markdown()).toBe("![[note|height=300]]\n");

    const reopened = await open_note(session.get_markdown());
    const restored = query(reopened.root, ".note-embed__content");
    expect(restored.style.height).toBe("300px");
    expect(restored.style.overflowY).toBe("auto");
  });

  it("keeps collapse alongside the height", async () => {
    const { root, session } = await open_note("![[note|collapsed]]\n");
    stub_rect(query(root, ".note-embed__content"), { width: 600, height: 0 });
    drag_handle(query(root, ".embed-resize-handle"), "y", 0, 90);
    expect(session.get_markdown()).toBe("![[note|collapsed|height=90]]\n");
  });

  it("double-click resets to auto height and removes the syntax", async () => {
    const { root, session } = await open_note("![[note|height=300]]\n");
    const content = query(root, ".note-embed__content");
    expect(content.style.height).toBe("300px");

    double_click(query(root, ".embed-resize-handle"));

    expect(content.style.height).toBe("");
    expect(session.get_markdown()).toBe("![[note]]\n");
  });
});

describe("file embed resize", () => {
  it("persists a dragged height and restores it on reopen", async () => {
    const { root, session } = await open_note("![[clip.mp4]]\n");
    const content = query(root, ".file-embed-content");
    expect(content.style.height).toBe("400px");
    stub_rect(content, { width: 600, height: 400 });

    drag_handle(query(root, ".file-embed .embed-resize-handle"), "y", 0, -160);

    expect(content.style.height).toBe("240px");
    expect(session.get_markdown()).toBe("![[clip.mp4#height=240]]\n");

    const reopened = await open_note(session.get_markdown());
    expect(query(reopened.root, ".file-embed-content").style.height).toBe(
      "240px",
    );
  });

  it("re-applies the height when the node changes outside the view", async () => {
    const { root, session } = await open_note("![[clip.mp4]]\n");
    const view = session.get_view?.();
    if (!view) throw new Error("no view");
    const node = view.state.doc.child(0);
    const pos = node.type.name === "file_embed" ? 0 : node.nodeSize;
    const embed = view.state.doc.nodeAt(pos);
    if (!embed) throw new Error("no embed");
    view.dispatch(
      view.state.tr.setNodeMarkup(pos, undefined, {
        ...embed.attrs,
        height: 150,
      }),
    );
    expect(query(root, ".file-embed-content").style.height).toBe("150px");
  });

  it("double-click resets to the default and removes the syntax", async () => {
    const { root, session } = await open_note("![[clip.mp4#height=240]]\n");
    double_click(query(root, ".embed-resize-handle"));
    expect(query(root, ".file-embed-content").style.height).toBe("400px");
    expect(session.get_markdown()).toBe("![[clip.mp4]]\n");
  });

  it("offers no handle for auto-height audio embeds", async () => {
    const { root } = await open_note("![[song.mp3]]\n");
    expect(root.querySelector(".embed-resize-handle")).toBeNull();
  });
});

describe("excalidraw embed resize", () => {
  async function mount(height: number | null) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const on_open_file = vi.fn();
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.excalidraw_embed.create({ src: "d.excalidraw", height }),
    ]);
    const view = new EditorView(container, {
      state: EditorState.create({
        doc,
        plugins: [
          create_excalidraw_embed_view_plugin({
            on_open_file,
            load_svg_preview: () => Promise.resolve("<svg></svg>"),
          }),
        ],
      }),
    });
    cleanups.push(() => {
      view.destroy();
    });
    await vi.waitFor(() => query(container, ".excalidraw-embed-preview"));
    return { view, container, on_open_file };
  }

  it("commits a dragged height without opening the drawing", async () => {
    const { view, container, on_open_file } = await mount(null);
    const preview = query(container, ".excalidraw-embed-preview");
    stub_rect(preview, { width: 600, height: 200 });
    const handle = query(container, ".embed-resize-handle");

    drag_handle(handle, "y", 0, 50);
    handle.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(view.state.doc.child(0).attrs["height"]).toBe(250);
    expect(preview.style.height).toBe("250px");
    expect(on_open_file).not.toHaveBeenCalled();
  });

  it("renders a stored height and resets it on double-click", async () => {
    const { view, container } = await mount(300);
    const preview = query(container, ".excalidraw-embed-preview");
    expect(preview.style.height).toBe("300px");

    double_click(query(container, ".embed-resize-handle"));

    expect(preview.style.height).toBe("");
    expect(view.state.doc.child(0).attrs["height"]).toBeNull();
  });
});

describe("code block preview resize", () => {
  function mount(language: string, height: number | null) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.code_block.create(
        { language, height },
        schema.text("<p>hi</p>"),
      ),
    ]);
    const view = new EditorView(container, {
      state: EditorState.create({
        doc,
        plugins: [create_code_block_view_prose_plugin()],
      }),
    });
    cleanups.push(() => {
      view.destroy();
    });
    return { view, container };
  }

  it("resizes the html preview pane, not the source", () => {
    const { view, container } = mount("html", null);
    const frame = query(container, ".code-block-preview-frame");
    stub_rect(frame, { width: 600, height: 120 });

    drag_handle(query(container, ".code-block-resize-handle"), "y", 0, 80);

    expect(frame.style.height).toBe("200px");
    expect(query(container, "pre").style.height).toBe("");
    expect(view.state.doc.child(0).attrs["height"]).toBe(200);
  });

  it("resizes the Mermaid preview rather than its hidden source", () => {
    const { view, container } = mount("mermaid", 180);
    const preview = query(container, ".mermaid-preview");
    expect(preview.style.height).toBe("180px");
    stub_rect(preview, { width: 600, height: 180 });
    drag_handle(query(container, ".code-block-resize-handle"), "y", 0, 60);
    expect(preview.style.height).toBe("240px");
    expect(query(container, "pre").style.height).toBe("");
    expect(view.state.doc.child(0).attrs["height"]).toBe(240);
  });

  it("places the handle below the preview pane", () => {
    const { container } = mount("html", null);
    const wrapper = query(container, ".code-block-wrapper");
    expect(wrapper.lastElementChild?.className).toBe(
      "code-block-resize-handle",
    );
  });

  it("keeps a user height over the frame's reported content height", () => {
    const { container } = mount("html", 220);
    const frame = query(container, ".code-block-preview-frame") as
      | HTMLIFrameElement
      | HTMLElement;
    expect(frame.style.height).toBe("220px");

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: PREVIEW_HEIGHT_MESSAGE, height: 90 },
        source: (frame as HTMLIFrameElement).contentWindow,
      }),
    );

    expect(frame.style.height).toBe("220px");
  });

  it("ignores frame auto-height messages during a drag", () => {
    const { container } = mount("html", null);
    const frame = query(container, ".code-block-preview-frame");
    const handle = query(container, ".code-block-resize-handle");
    stub_rect(frame, { width: 600, height: 120 });
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { clientY: 0, pointerId: 1 }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointermove", { clientY: 80, pointerId: 1 }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: PREVIEW_HEIGHT_MESSAGE, height: 90 },
        source: (frame as HTMLIFrameElement).contentWindow,
      }),
    );
    expect(frame.style.height).toBe("200px");
    handle.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
  });

  it("restores the reported content height on double-click", () => {
    const { view, container } = mount("html", 220);
    const frame = query(container, ".code-block-preview-frame");
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: PREVIEW_HEIGHT_MESSAGE, height: 90 },
        source: (frame as HTMLIFrameElement).contentWindow,
      }),
    );

    double_click(query(container, ".code-block-resize-handle"));

    expect(frame.style.height).toBe("90px");
    expect(view.state.doc.child(0).attrs["height"]).toBeNull();
  });

  it("sizes the source when the preview is toggled off", () => {
    const { container } = mount("html", 220);
    const toggle = query(container, ".code-block-preview-toggle");
    toggle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(query(container, "pre").style.height).toBe("220px");
  });
});

describe("image-block resize", () => {
  it("commits a pixel width that serializes as the Obsidian alt suffix", () => {
    const ctx: PluginContext = {
      events: { on_markdown_change: () => {}, on_dirty_state_change: () => {} },
      get_note_path: () => "note.md",
      get_vault_id: () => null,
      get_markdown: () => "",
      resolve_asset_url_for_vault: null,
      syntax_reveal_enabled: true,
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new EditorView(container, {
      state: EditorState.create({
        doc: schema.nodes.doc.create(null, [
          schema.nodes["image-block"].create({ src: "https://x/a.png" }),
        ]),
        plugins: create_image_extension(ctx).plugins,
      }),
    });
    cleanups.push(() => {
      view.destroy();
    });
    const wrapper = query(container, ".image-wrapper");
    stub_rect(wrapper, { width: 400, height: 300 });

    drag_handle(query(container, ".image-resize-handle"), "x", 0, -99.6);

    expect(view.state.doc.child(0).attrs["width"]).toBe("300px");
  });

  it("applies a stored width to an inline image", async () => {
    const { root } = await open_note("text ![a|120](https://x/a.png)\n");
    expect(query(root, "img").style.width).toBe("120px");
  });
});

describe("embed size clipboard preservation", () => {
  it.each(["note_embed", "excalidraw_embed"] as const)(
    "preserves %s height through DOM",
    (type) => {
      const node = schema.nodes[type].create({
        src: "target",
        display_src: "target",
        height: 240,
      });
      const container = document.createElement("div");
      container.appendChild(
        DOMSerializer.fromSchema(schema).serializeNode(node),
      );
      const doc = DOMParser.fromSchema(schema).parse(container);
      expect(doc.firstChild?.attrs["height"]).toBe(240);
    },
  );
});
