/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import type { EditorSession } from "$lib/features/editor/ports";

async function create_session(
  initial_markdown: string,
  callbacks?: {
    on_dirty_state_change?: (is_dirty: boolean) => void;
    on_markdown_change?: (markdown: string) => void;
  },
): Promise<{ session: EditorSession; root: HTMLElement }> {
  const root = document.createElement("div");
  document.body.appendChild(root);

  const port = create_prosemirror_editor_port();
  const session = await port.start_session({
    root,
    initial_markdown,
    note_path: "test.md",
    vault_id: null,
    events: {
      on_markdown_change: callbacks?.on_markdown_change ?? vi.fn(),
      on_dirty_state_change: callbacks?.on_dirty_state_change ?? vi.fn(),
      on_cursor_change: vi.fn(),
      on_selection_change: vi.fn(),
    },
  });

  return { session, root };
}

describe("prosemirror serialize debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("coalesces a typing burst into a single deferred serialization", async () => {
    const on_markdown = vi.fn();
    const { session } = await create_session("hello world\n", {
      on_markdown_change: on_markdown,
    });
    on_markdown.mockClear();

    session.insert_text_at_cursor("a");
    session.insert_text_at_cursor("b");
    session.insert_text_at_cursor("c");
    expect(on_markdown).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(on_markdown).toHaveBeenCalledTimes(1);
    const burst = on_markdown.mock.calls[0]?.[0] as string;
    expect(burst).toContain("a");
    expect(burst).toContain("b");
    expect(burst).toContain("c");

    session.destroy();
  });

  it("get_markdown mid-window returns the last keystroke and does not double-serialize", async () => {
    const on_markdown = vi.fn();
    const { session } = await create_session("hello world\n", {
      on_markdown_change: on_markdown,
    });
    on_markdown.mockClear();

    session.insert_text_at_cursor("fresh");

    expect(session.get_markdown()).toContain("fresh");
    expect(on_markdown).toHaveBeenCalledTimes(1);

    vi.runAllTimers();
    expect(on_markdown).toHaveBeenCalledTimes(1);

    session.destroy();
  });

  it("flips dirty synchronously on a doc change, before the debounce fires", async () => {
    const on_dirty = vi.fn();
    const { session } = await create_session("hello world\n", {
      on_dirty_state_change: on_dirty,
    });
    on_dirty.mockClear();

    session.insert_text_at_cursor("x");

    expect(on_dirty).toHaveBeenCalledWith(true);
    expect(session.is_dirty()).toBe(true);

    session.destroy();
  });

  it("clears an optimistic dirty flip when the doc serializes back to the saved text", async () => {
    const on_dirty = vi.fn();
    const { session } = await create_session("hello world\n", {
      on_dirty_state_change: on_dirty,
    });
    on_dirty.mockClear();

    const view = session.get_view?.();
    if (!view) throw new Error("missing view");
    view.dispatch(view.state.tr.insertText("x", 1));
    expect(session.is_dirty()).toBe(true);

    view.dispatch(view.state.tr.delete(1, 2));

    vi.runAllTimers();

    expect(session.is_dirty()).toBe(false);
    expect(on_dirty).toHaveBeenLastCalledWith(false);

    session.destroy();
  });

  it("apply_markdown_diff cancels a pending pre-diff serialization", async () => {
    const { session } = await create_session("hello world\n");

    session.insert_text_at_cursor("typed");
    const applied = session.apply_markdown_diff?.("replacement text\n");
    expect(applied).toBe(true);

    vi.runAllTimers();

    expect(session.get_markdown()).toBe("replacement text\n");

    session.destroy();
  });

  it("apply_markdown_diff sees pending keystrokes in its no-op guard", async () => {
    const { session } = await create_session("hello world\n");

    session.insert_text_at_cursor("typed");
    const before = session.get_markdown();

    expect(session.apply_markdown_diff?.(before)).toBe(false);

    session.destroy();
  });

  it("set_markdown mid-window wins over the pending keystroke", async () => {
    const { session } = await create_session("hello world\n");

    session.insert_text_at_cursor("typed");
    session.set_markdown("replaced\n");

    vi.runAllTimers();

    expect(session.get_markdown()).toBe("replaced\n");

    session.destroy();
  });

  it("set_markdown leaves the editor state unchanged for identical content", async () => {
    const { session } = await create_session("hello world\n");
    const view = session.get_view?.();
    if (!view) throw new Error("missing view");
    const state = view.state;

    session.set_markdown("hello world\n");

    expect(view.state).toBe(state);
    session.destroy();
  });

  it("a buffer switch mid-window snapshots the un-serialized keystroke", async () => {
    const on_markdown = vi.fn();
    const { session } = await create_session("note A content\n", {
      on_markdown_change: on_markdown,
    });

    session.insert_text_at_cursor("edited");
    session.open_buffer({
      note_path: "b.md",
      vault_id: null,
      initial_markdown: "note B content\n",
      restore_policy: "reuse_cache",
    });

    const flushed = on_markdown.mock.calls
      .map((call) => call[0] as string)
      .find((md) => md.includes("edited"));
    expect(flushed).toContain("edited");
    expect(flushed).toContain("note A content");

    session.open_buffer({
      note_path: "test.md",
      vault_id: null,
      initial_markdown: flushed ?? "",
      restore_policy: "reuse_cache",
    });

    expect(session.get_markdown()).toContain("edited");
    expect(session.get_markdown()).toContain("note A content");

    session.destroy();
  });

  it("destroy mid-window emits the final markdown and fires nothing afterwards", async () => {
    const on_markdown = vi.fn();
    const { session } = await create_session("hello world\n", {
      on_markdown_change: on_markdown,
    });
    on_markdown.mockClear();

    session.insert_text_at_cursor("last");
    session.destroy();

    expect(on_markdown).toHaveBeenCalledTimes(1);
    expect(on_markdown.mock.calls[0]?.[0]).toContain("last");

    vi.runAllTimers();
    expect(on_markdown).toHaveBeenCalledTimes(1);
  });
});
