/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import type { EditorSession } from "$lib/features/editor/ports";

const MARKDOWN = "a **bold** b and *em* c\n\ntail\n";

type Harness = {
  session: EditorSession;
  view: EditorView;
  on_dirty: ReturnType<typeof vi.fn>;
  on_markdown: ReturnType<typeof vi.fn>;
};

let root: HTMLElement | null = null;

async function start(syntax_reveal_enabled = true): Promise<Harness> {
  root = document.createElement("div");
  root.className = "show-block-drag-handle";
  document.body.appendChild(root);
  const on_dirty = vi.fn();
  const on_markdown = vi.fn();
  const session = await create_prosemirror_editor_port().start_session({
    root,
    initial_markdown: MARKDOWN,
    note_path: "test.md",
    vault_id: null,
    syntax_reveal_enabled,
    events: {
      on_markdown_change: on_markdown,
      on_dirty_state_change: on_dirty,
      on_cursor_change: vi.fn(),
      on_selection_change: vi.fn(),
    },
  });
  vi.runAllTimers();
  on_dirty.mockClear();
  on_markdown.mockClear();
  const view = session.get_view?.();
  if (!view) throw new Error("session has no view");
  return { session, view, on_dirty, on_markdown };
}

function place_caret(view: EditorView, pos: number): void {
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
  );
}

describe("source-in-place inside an editor session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    root?.remove();
    root = null;
  });

  it("never marks the note dirty or emits Markdown for caret moves alone", async () => {
    const { session, view, on_dirty, on_markdown } = await start();
    const tail = view.state.doc.content.size - 1;

    for (const pos of [7, 3, tail, 19, 1, tail]) {
      place_caret(view, Math.min(pos, view.state.doc.content.size - 1));
      vi.runAllTimers();
    }

    expect(view.state.doc.child(0).textContent).toBe("a bold b and em c");
    expect(on_dirty).not.toHaveBeenCalled();
    expect(on_markdown).not.toHaveBeenCalled();
    expect(session.is_dirty()).toBe(false);
    expect(session.get_markdown()).toBe(MARKDOWN);
    session.destroy();
  });

  it("serializes the literal source verbatim while the caret is on it", async () => {
    const { session, view } = await start();
    place_caret(view, 7);

    expect(view.state.doc.child(0).textContent).toBe("a **bold** b and em c");
    expect(session.get_markdown()).toBe(MARKDOWN);
    session.destroy();
  });

  it("still marks the note dirty for an edit typed into the source", async () => {
    const { session, view, on_dirty, on_markdown } = await start();
    place_caret(view, 7);
    view.dispatch(view.state.tr.insertText("X", 7));
    vi.runAllTimers();

    expect(on_dirty).toHaveBeenCalledWith(true);
    expect(on_markdown).toHaveBeenCalledWith(
      "a **boXld** b and *em* c\n\ntail\n",
    );
    expect(session.get_markdown()).toBe("a **boXld** b and *em* c\n\ntail\n");
    session.destroy();
  });

  it.each(["turn_into", "turn_into_at", "batch_turn_into"] as const)(
    "normalizes source before %s converts it to code",
    async (command) => {
      const { session, view } = await start();
      place_caret(view, 7);
      if (command === "turn_into") session.turn_into?.("code_block");
      if (command === "turn_into_at")
        session.turn_into_at?.("code_block", undefined, 0);
      if (command === "batch_turn_into")
        session.batch_turn_into?.("code_block", undefined, new Set([0]));
      expect(view.state.doc.child(0).type.name).toBe("code_block");
      expect(view.state.doc.child(0).textContent).toBe("a bold b and em c");
      session.destroy();
    },
  );

  it.each([
    "duplicate_block",
    "duplicate_block_at",
    "batch_duplicate",
  ] as const)("does not leave orphan source after %s", async (command) => {
    const { session, view } = await start();
    place_caret(view, 7);
    if (command === "duplicate_block") session.duplicate_block?.();
    if (command === "duplicate_block_at") session.duplicate_block_at?.(0);
    if (command === "batch_duplicate") session.batch_duplicate?.(new Set([0]));
    place_caret(view, view.state.doc.content.size - 1);
    const paragraphs: string[] = [];
    view.state.doc.forEach((node) => {
      if (node.textContent) paragraphs.push(node.textContent);
    });
    expect(paragraphs).toEqual([
      "a bold b and em c",
      "a bold b and em c",
      "tail",
    ]);
    for (const index of [0, 1]) {
      expect(view.state.doc.child(index).textContent).toBe("a bold b and em c");
      view.state.doc.child(index).descendants((node) => {
        expect(node.marks.some((mark) => mark.type.name === "md_source")).toBe(
          false,
        );
      });
    }
    session.destroy();
  });

  it("normalizes source before a block drag captures its slice", async () => {
    const { session, view } = await start();
    place_caret(view, 7);
    const handle = view.dom.querySelector(".block-drag-handle");
    if (!handle) throw new Error("missing block drag handle");
    handle.dispatchEvent(new Event("dragstart", { cancelable: true }));
    const slice = view.dragging?.slice;
    expect(slice).toBeDefined();
    expect(slice?.content.firstChild?.textContent).toBe("a bold b and em c");
    slice?.content.descendants((node) => {
      expect(node.marks.some((mark) => mark.type.name === "md_source")).toBe(
        false,
      );
    });
    session.destroy();
  });

  it("leaves the document and its Markdown untouched with reveal off", async () => {
    const { session, view, on_dirty, on_markdown } = await start(false);
    const before = view.state.doc;
    place_caret(view, 7);
    vi.runAllTimers();

    expect(view.state.doc).toBe(before);
    expect(on_dirty).not.toHaveBeenCalled();
    expect(on_markdown).not.toHaveBeenCalled();
    expect(session.get_markdown()).toBe(MARKDOWN);
    session.destroy();
  });
});
