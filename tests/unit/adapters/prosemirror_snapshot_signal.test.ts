/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextSelection } from "prosemirror-state";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import type { EditorSession } from "$lib/features/editor/ports";

async function create_session(events: {
  ahead: (value: boolean) => void;
  on_markdown_change?: (markdown: string) => void;
}): Promise<EditorSession> {
  const root = document.createElement("div");
  document.body.appendChild(root);

  const port = create_prosemirror_editor_port();
  return port.start_session({
    root,
    initial_markdown: "hello world\n",
    note_path: "test.md",
    vault_id: null,
    events: {
      on_markdown_change: events.on_markdown_change ?? vi.fn(),
      on_dirty_state_change: vi.fn(),
      on_cursor_change: vi.fn(),
      on_selection_change: vi.fn(),
      on_doc_ahead_of_snapshot_change: events.ahead,
    },
  });
}

describe("prosemirror serialization signal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("reports the document ahead on an edit and clears it after serializing", async () => {
    const ahead = vi.fn();
    const session = await create_session({ ahead });
    ahead.mockClear();

    session.insert_text_at_cursor("x");
    expect(ahead).toHaveBeenLastCalledWith(true);

    vi.runAllTimers();
    expect(ahead).toHaveBeenLastCalledWith(false);

    session.destroy();
  });

  it("clears the signal even when the serialized text is unchanged", async () => {
    const ahead = vi.fn();
    const on_markdown_change = vi.fn();
    const session = await create_session({ ahead, on_markdown_change });
    const view = session.get_view?.();
    if (!view) throw new Error("missing view");
    on_markdown_change.mockClear();
    ahead.mockClear();

    view.dispatch(view.state.tr.insertText("x", 1));
    expect(ahead).toHaveBeenLastCalledWith(true);

    view.dispatch(view.state.tr.delete(1, 2));
    vi.runAllTimers();

    expect(on_markdown_change).not.toHaveBeenCalled();
    expect(ahead).toHaveBeenLastCalledWith(false);
    expect(session.get_markdown()).toBe("hello world\n");

    session.destroy();
  });

  it("does not signal for a selection-only transaction", async () => {
    const ahead = vi.fn();
    const session = await create_session({ ahead });
    const view = session.get_view?.();
    if (!view) throw new Error("missing view");
    ahead.mockClear();

    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)),
    );
    vi.runAllTimers();

    expect(ahead).not.toHaveBeenCalled();

    session.destroy();
  });
});
