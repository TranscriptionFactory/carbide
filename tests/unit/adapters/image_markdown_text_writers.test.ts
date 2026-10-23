/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Slice } from "prosemirror-model";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { create_source_in_place_plugin } from "$lib/features/editor/adapters/source_in_place_plugin";
import { create_image_input_rule_prose_plugin } from "$lib/features/editor/adapters/image_input_rule_plugin";
import {
  create_image_suggest_prose_plugin,
  set_image_suggestions,
} from "$lib/features/editor/adapters/image_suggest_plugin";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_markdown_paste_prose_plugin } from "$lib/features/editor/adapters/markdown_paste_plugin";

const IMAGE = "![](6_BLOB/x.png)";

let mounted: EditorView | null = null;

afterEach(() => {
  mounted?.destroy();
  mounted = null;
});

function mount(markdown: string, plugins: Plugin[]): EditorView {
  const state = EditorState.create({ doc: parse_markdown(markdown), plugins });
  mounted = new EditorView(document.createElement("div"), {
    state,
    editable: () => true,
  });
  return mounted;
}

function place_caret(view: EditorView, pos: number): void {
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
  );
}

function paste_plain(view: EditorView, text: string): void {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) => (type === "text/plain" ? text : ""),
    },
  });
  view.dom.dispatchEvent(event);
}

function paste_html(view: EditorView, plain: string, html: string): void {
  const data: Record<string, string> = {
    "text/plain": plain,
    "text/html": html,
  };
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      types: Object.keys(data),
      items: [],
      getData: (type: string) => data[type] ?? "",
    },
  });
  view.dom.dispatchEvent(event);
}

function type_text(view: EditorView, text: string): void {
  for (const char of text) {
    const { from } = view.state.selection;
    view.dispatch(view.state.tr.insertText(char, from));
  }
}

function inline_node_names(view: EditorView): string[] {
  const names: string[] = [];
  view.state.doc.firstChild?.forEach((node) => names.push(node.type.name));
  return names;
}

function suggest_plugin(): Plugin {
  return create_image_suggest_prose_plugin({
    on_query: () => {},
    on_dismiss: () => {},
    base_note_path: "note.md",
  });
}

function accept_suggestion(view: EditorView, path: string): void {
  set_image_suggestions(view, [{ path, name: "x.png" }]);
  view.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
}

describe("image markdown never lands in a text node", () => {
  it("re-parses Markdown pasted at the end of a revealed source run", () => {
    const view = mount("a **bold** b\n\ntail\n", [
      create_source_in_place_plugin(),
    ]);
    place_caret(view, 5);
    place_caret(view, 1 + "a **bold**".length);
    paste_plain(view, IMAGE);
    place_caret(view, view.state.doc.content.size - 1);

    expect(serialize_markdown(view.state.doc)).toBe(
      `a **bold**${IMAGE} b\n\ntail\n`,
    );
  });

  it("inserts an image node when suggest completes inside a paragraph with text", () => {
    const view = mount("hello\n", [
      suggest_plugin(),
      create_image_input_rule_prose_plugin(),
    ]);
    const end = 1 + "hello".length;
    view.dispatch(view.state.tr.insertText(" ![](6_B", end));
    place_caret(view, end + " ![](6_B".length);
    accept_suggestion(view, "6_BLOB/x.png");

    expect(inline_node_names(view)).toEqual(["text", "image"]);
    expect(serialize_markdown(view.state.doc)).toBe(`hello ${IMAGE}\n`);
  });

  it("consumes an auto-paired closing paren and keeps the alt text", () => {
    const view = mount("hello\n", [suggest_plugin()]);
    const end = 1 + "hello".length;
    view.dispatch(view.state.tr.insertText(" ![cat]()", end));
    place_caret(view, end + " ![cat](".length);
    accept_suggestion(view, "6_BLOB/x.png");

    expect(serialize_markdown(view.state.doc)).toBe(
      "hello ![cat](6_BLOB/x.png)\n",
    );
  });

  it("keeps a pasted image an image-block with the same src after save and reopen", () => {
    const plugins = [create_image_input_rule_prose_plugin()];
    const view = mount("\n", plugins);
    view.dispatch(
      view.state.tr.replaceSelection(
        new Slice(parse_markdown(IMAGE).content, 0, 0),
      ),
    );
    const saved = serialize_markdown(view.state.doc);

    const empty = EditorState.create({ doc: parse_markdown("\n"), plugins });
    const reopened = empty.apply(
      empty.tr.replaceWith(
        0,
        empty.doc.content.size,
        parse_markdown(saved).content,
      ),
    );

    const block = reopened.doc.firstChild;
    expect(saved).toBe(`${IMAGE}\n`);
    expect(block?.type.name).toBe("image-block");
    expect(block?.attrs["src"]).toBe("6_BLOB/x.png");
  });
});

describe("HTML clipboard paste of image markdown", () => {
  function paste_plugins(): Plugin[] {
    return [
      create_markdown_paste_prose_plugin(parse_markdown),
      create_image_input_rule_prose_plugin(),
    ];
  }

  it("saves an image block, not escaped text, when the HTML text is image markdown", () => {
    const view = mount("\n", paste_plugins());
    place_caret(view, 1);
    paste_html(view, IMAGE, `<p>${IMAGE}</p>`);

    const saved = serialize_markdown(view.state.doc);
    expect(view.state.doc.firstChild?.type.name).toBe("image-block");
    expect(saved).toContain(IMAGE);
    expect(saved).not.toContain("\\");
  });

  it("inserts an inline image when the pasted text contains image markdown", () => {
    const view = mount("hello world\n", paste_plugins());
    place_caret(view, 1 + "hello ".length);
    paste_html(view, IMAGE, `<span>${IMAGE}</span>`);

    expect(inline_node_names(view)).toEqual(["text", "image", "text"]);
    expect(serialize_markdown(view.state.doc)).toBe(`hello ${IMAGE}world\n`);
  });

  it("still converts a rich web page paste through HTML", () => {
    const view = mount("\n", paste_plugins());
    place_caret(view, 1);
    paste_html(
      view,
      "Title\nSome bold text",
      "<h1>Title</h1><p>Some <strong>bold</strong> text</p>",
    );

    expect(serialize_markdown(view.state.doc)).toBe(
      "# Title\n\nSome **bold** text\n",
    );
  });
});

describe("typed image markdown", () => {
  it("becomes an inline image when typed after text in a paragraph", () => {
    const view = mount("hello\n", [create_image_input_rule_prose_plugin()]);
    place_caret(view, 1 + "hello".length);
    type_text(view, ` ${IMAGE}`);

    expect(inline_node_names(view)).toEqual(["text", "image"]);
    expect(serialize_markdown(view.state.doc)).toBe(`hello ${IMAGE}\n`);
  });

  it("becomes an inline image when typed before text in a paragraph", () => {
    const view = mount("hello\n", [create_image_input_rule_prose_plugin()]);
    place_caret(view, 1);
    type_text(view, `${IMAGE} `);

    expect(inline_node_names(view)).toEqual(["image", "text"]);
    expect(serialize_markdown(view.state.doc)).toBe(`${IMAGE} hello\n`);
  });

  it("keeps a standalone typed image an image block", () => {
    const view = mount("\n", [create_image_input_rule_prose_plugin()]);
    place_caret(view, 1);
    type_text(view, IMAGE);

    const block = view.state.doc.firstChild;
    expect(block?.type.name).toBe("image-block");
    expect(block?.attrs["src"]).toBe("6_BLOB/x.png");
  });

  it("leaves image markdown inside inline code as text", () => {
    const view = mount(`a \`${IMAGE}\` b\n`, [
      create_image_input_rule_prose_plugin(),
    ]);
    place_caret(view, view.state.doc.content.size - 1);
    type_text(view, "c");

    expect(inline_node_names(view)).not.toContain("image");
  });

  it("does not repair an escaped image line loaded from disk when editing elsewhere", () => {
    const view = mount("before \\![alt](x.png) after\n", [
      create_image_input_rule_prose_plugin(),
    ]);
    place_caret(view, view.state.doc.content.size - 1);
    type_text(view, "c");

    expect(inline_node_names(view)).not.toContain("image");
    expect(serialize_markdown(view.state.doc)).toBe(
      "before \\![alt](x.png) afterc\n",
    );
  });

  it("does not convert existing image text when editing elsewhere in the paragraph", () => {
    const paragraph = schema.nodes.paragraph.create(
      null,
      schema.text(`a ${IMAGE} b`),
    );
    const state = EditorState.create({
      doc: schema.nodes.doc.create(null, paragraph),
      plugins: [create_image_input_rule_prose_plugin()],
    });
    mounted = new EditorView(document.createElement("div"), { state });
    const view = mounted;
    place_caret(view, view.state.doc.content.size - 1);
    type_text(view, "c");

    expect(inline_node_names(view)).toEqual(["text"]);
  });
});
