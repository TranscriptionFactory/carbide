/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  create_wiki_suggest_prose_plugin,
  set_block_suggestions,
} from "$lib/features/editor/adapters/wiki_suggest_plugin";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

describe("wiki block suggestion acceptance", () => {
  it("mints an unminted target before inserting its link", async () => {
    const on_block_accept = vi.fn(() => Promise.resolve("mint01"));
    const plugin = create_wiki_suggest_prose_plugin({
      on_query: vi.fn(),
      on_dismiss: vi.fn(),
      base_note_path: "source.md",
      on_block_accept,
    });
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("[[target#^")),
    ]);
    const target = document.createElement("div");
    document.body.appendChild(target);
    view = new EditorView(target, {
      state: EditorState.create({ schema, doc, plugins: [plugin] }),
    });
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(doc, doc.content.size - 1),
      ),
    );
    set_block_suggestions(view, [
      {
        block_id: null,
        text: "target claim",
        line: 1,
        note_path: "target.md",
      },
    ]);

    const mounted_view = view;
    view.someProp("handleKeyDown", (handler) =>
      handler(mounted_view, new KeyboardEvent("keydown", { key: "Enter" })),
    );
    await vi.waitUntil(() => on_block_accept.mock.calls.length === 1);
    await vi.waitUntil(
      () => view?.state.doc.textContent.includes("mint01") ?? false,
    );

    expect(on_block_accept).toHaveBeenCalledWith({
      block_id: null,
      text: "target claim",
      line: 1,
      note_path: "target.md",
    });
    expect(view.state.doc.textContent).toBe("[[target#^mint01]]");
  });

  it("inserts a pre-minted id without writing the target", () => {
    const on_block_accept = vi.fn(() => Promise.resolve("unused"));
    const plugin = create_wiki_suggest_prose_plugin({
      on_query: vi.fn(),
      on_dismiss: vi.fn(),
      base_note_path: "source.md",
      on_block_accept,
    });
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("[[target#^")),
    ]);
    const target = document.createElement("div");
    document.body.appendChild(target);
    view = new EditorView(target, {
      state: EditorState.create({ schema, doc, plugins: [plugin] }),
    });
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(doc, doc.content.size - 1),
      ),
    );
    set_block_suggestions(view, [
      {
        block_id: "kept01",
        text: "target claim",
        line: 1,
        note_path: "target.md",
      },
    ]);

    const mounted_view = view;
    view.someProp("handleKeyDown", (handler) =>
      handler(mounted_view, new KeyboardEvent("keydown", { key: "Enter" })),
    );

    expect(on_block_accept).not.toHaveBeenCalled();
    expect(view.state.doc.textContent).toBe("[[target#^kept01]]");
  });
});
