/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TextSelection } from "prosemirror-state";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import type { EditorSession } from "$lib/features/editor/ports";
import type { CursorInfo } from "$lib/shared/types/editor";

async function create_session(
  on_cursor_change: (info: CursorInfo) => void,
  initial_markdown = "hello world",
): Promise<EditorSession> {
  const root = document.createElement("div");
  document.body.appendChild(root);

  const port = create_prosemirror_editor_port();
  return port.start_session({
    root,
    initial_markdown,
    note_path: "test.md",
    vault_id: null,
    events: {
      on_markdown_change: vi.fn(),
      on_dirty_state_change: vi.fn(),
      on_cursor_change,
      on_selection_change: vi.fn(),
    },
  });
}

function last_cursor(calls: unknown[][]): CursorInfo {
  return calls[calls.length - 1]?.[0] as CursorInfo;
}

describe("prosemirror cursor totals deferral", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("reports correct word and line totals after a deferred recompute", async () => {
    const on_cursor = vi.fn();
    const session = await create_session(on_cursor);
    const view = session.get_view?.();
    if (!view) throw new Error("missing view");

    view.dispatch(
      view.state.tr.insertText(" foo", view.state.doc.content.size - 1),
    );

    vi.runAllTimers();

    const last = last_cursor(on_cursor.mock.calls);
    expect(last.total_words).toBe(3);
    expect(last.total_lines).toBe(2);
    expect(last.line).toBe(1);

    session.destroy();
  });

  it("defers the word-count recompute off the synchronous edit path", async () => {
    const on_cursor = vi.fn();
    const session = await create_session(on_cursor);
    const view = session.get_view?.();
    if (!view) throw new Error("missing view");

    view.dispatch(
      view.state.tr.insertText(" foo", view.state.doc.content.size - 1),
    );
    vi.runAllTimers();
    expect(last_cursor(on_cursor.mock.calls).total_words).toBe(3);
    on_cursor.mockClear();

    view.dispatch(
      view.state.tr.insertText(" bar", view.state.doc.content.size - 1),
    );
    expect(last_cursor(on_cursor.mock.calls).total_words).toBe(3);

    vi.runAllTimers();
    expect(last_cursor(on_cursor.mock.calls).total_words).toBe(4);

    session.destroy();
  });

  it("updates the line number with the deferred recompute, not before", async () => {
    const on_cursor = vi.fn();
    const session = await create_session(on_cursor, "first\n\nsecond\n\nthird");
    const view = session.get_view?.();
    if (!view) throw new Error("missing view");
    vi.runAllTimers();
    on_cursor.mockClear();

    const doc = view.state.doc;
    const third_block = doc.child(0).nodeSize + doc.child(1).nodeSize;
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(doc, third_block + 1)),
    );

    expect(last_cursor(on_cursor.mock.calls).line).toBe(1);

    vi.runAllTimers();
    expect(last_cursor(on_cursor.mock.calls).line).toBe(3);

    session.destroy();
  });
});
