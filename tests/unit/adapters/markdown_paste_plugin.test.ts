/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { Slice } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  create_markdown_paste_prose_plugin,
  insert_parsed_content,
} from "$lib/features/editor/adapters/markdown_paste_plugin";
import { schema } from "$lib/features/editor/adapters/schema";

function make_parse_fn(md: string) {
  const para = schema.nodes.paragraph.create(
    null,
    md.length > 0 ? schema.text(md) : [],
  );
  return { content: schema.nodes.doc.create(null, [para]).content };
}

function make_clipboard_event(
  data: Record<string, string>,
  files: { kind: string; type: string }[] = [],
): ClipboardEvent {
  const items = [
    ...Object.entries(data).map(([type, value]) => ({
      kind: "string" as const,
      type,
      getAsString: (cb: (s: string) => void) => cb(value),
      getAsFile: () => null,
      webkitGetAsEntry: () => null,
    })),
    ...files.map((f) => ({
      kind: f.kind,
      type: f.type,
      getAsString: () => {},
      getAsFile: () => null,
      webkitGetAsEntry: () => null,
    })),
  ];

  const clipboard_data = {
    getData: (type: string) => data[type] ?? "",
    items,
    types: Object.keys(data),
    files: [] as File[],
    clearData: () => {},
    setData: () => {},
    setDragImage: () => {},
    dropEffect: "none" as const,
    effectAllowed: "none" as const,
  } as unknown as DataTransfer;

  const event = new Event("paste") as unknown as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", { value: clipboard_data });
  Object.defineProperty(event, "preventDefault", { value: vi.fn() });
  return event;
}

function create_editor_view(parse_fn: typeof make_parse_fn): EditorView {
  const plugin = create_markdown_paste_prose_plugin(parse_fn);
  const state = EditorState.create({ schema, plugins: [plugin] });
  const dom = document.createElement("div");
  return new EditorView(dom, { state, editable: () => true });
}

describe("create_markdown_paste_prose_plugin", () => {
  describe("clipboardTextParser", () => {
    it("parses plain text through parse_fn", () => {
      const plugin = create_markdown_paste_prose_plugin(make_parse_fn);
      const parser = plugin.props.clipboardTextParser;
      expect(parser).toBeDefined();

      const result = (parser as Function)("hello world", null, true, {});
      expect(result).toBeInstanceOf(Slice);
      expect(result.content.childCount).toBeGreaterThan(0);
    });

    it("returns empty slice for whitespace-only text", () => {
      const plugin = create_markdown_paste_prose_plugin(make_parse_fn);
      const parser = plugin.props.clipboardTextParser;

      const result = (parser as Function)("   ", null, true, {});
      expect(result).toEqual(Slice.empty);
    });

    it("returns empty slice when no view provided", () => {
      const plugin = create_markdown_paste_prose_plugin(make_parse_fn);
      const parser = plugin.props.clipboardTextParser;

      const result = (parser as Function)("hello", null, true, null);
      expect(result).toEqual(Slice.empty);
    });

    it("returns empty slice when parse_fn throws", () => {
      const throwing_parse = () => {
        throw new Error("parse error");
      };
      const plugin = create_markdown_paste_prose_plugin(throwing_parse);
      const parser = plugin.props.clipboardTextParser;

      const result = (parser as Function)("hello", null, true, {});
      expect(result).toEqual(Slice.empty);
    });
  });

  describe("handlePaste async fallback", () => {
    it("returns true and prevents default when clipboardData is empty", () => {
      const view = create_editor_view(make_parse_fn);
      const event = make_clipboard_event({
        "text/plain": "",
        "text/html": "",
        "text/markdown": "",
      });

      const handler = view.someProp("handlePaste") as Function;
      const result = handler(view, event);

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("returns false when clipboardData is empty but has file items", () => {
      const view = create_editor_view(make_parse_fn);
      const event = make_clipboard_event(
        { "text/plain": "", "text/html": "", "text/markdown": "" },
        [{ kind: "file", type: "image/png" }],
      );

      const handler = view.someProp("handlePaste") as Function;
      const result = handler(view, event);

      expect(result).toBe(false);
    });
  });

  describe("insert_parsed_content", () => {
    it("inserts parsed markdown into the editor", () => {
      const view = create_editor_view(make_parse_fn);
      const result = insert_parsed_content(view, "hello world", make_parse_fn);

      expect(result).toBe(true);
      expect(view.state.doc.textContent).toContain("hello world");
    });

    it("returns false for empty source", () => {
      const view = create_editor_view(make_parse_fn);
      const result = insert_parsed_content(view, "  ", make_parse_fn);

      expect(result).toBe(false);
    });

    it("returns false when parse_fn throws", () => {
      const view = create_editor_view(make_parse_fn);
      const throwing_parse = () => {
        throw new Error("parse error");
      };
      const result = insert_parsed_content(view, "hello", throwing_parse);

      expect(result).toBe(false);
    });
  });
});
