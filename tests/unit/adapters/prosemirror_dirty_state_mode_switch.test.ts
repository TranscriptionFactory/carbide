/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import type { EditorSession } from "$lib/features/editor/ports";

async function create_session(
  initial_markdown: string,
  callbacks?: {
    on_dirty_state_change?: (is_dirty: boolean) => void;
    on_markdown_change?: (markdown: string) => void;
  },
): Promise<{ session: EditorSession; container: HTMLElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const port = create_prosemirror_editor_port();
  const session = await port.start_session({
    root: container,
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

  return { session, container };
}

describe("mark_clean with saved_content parameter", () => {
  let container: HTMLElement | null = null;

  afterEach(() => {
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
  });

  it("mark_clean without arg sets saved_markdown to current_markdown", async () => {
    const on_dirty = vi.fn();
    const { session, container: c } = await create_session("hello\n", {
      on_dirty_state_change: on_dirty,
    });
    container = c;

    session.insert_text_at_cursor("world ");
    expect(session.is_dirty()).toBe(true);

    session.mark_clean();
    expect(session.is_dirty()).toBe(false);

    session.destroy();
  });

  it("mark_clean with saved_content uses that as the saved baseline", async () => {
    const on_dirty = vi.fn();
    const { session, container: c } = await create_session("original\n", {
      on_dirty_state_change: on_dirty,
    });
    container = c;

    // Simulate: save happened with content "modified\n" while ProseMirror
    // still had "original\n" (source mode scenario)
    session.mark_clean("modified\n");

    // ProseMirror doc is still "original\n" but saved baseline is "modified\n"
    // So the session should consider itself dirty (content != saved)
    // However mark_clean always sets current_is_dirty = false at call time.
    // The mismatch becomes visible after set_markdown syncs content.
    expect(session.is_dirty()).toBe(false);

    // Now sync visual from the saved content (simulates source→visual switch)
    on_dirty.mockClear();
    session.set_markdown("modified\n");

    // After syncing, ProseMirror now has "modified\n" which matches
    // saved baseline "modified\n" — should remain clean
    expect(session.is_dirty()).toBe(false);
    expect(on_dirty).not.toHaveBeenCalledWith(true);

    session.destroy();
  });

  it("without saved_content, set_markdown after source-mode save re-dirties", async () => {
    const on_dirty = vi.fn();
    const { session, container: c } = await create_session("original\n", {
      on_dirty_state_change: on_dirty,
    });
    container = c;

    // mark_clean WITHOUT saved_content — saved_markdown = "original\n"
    session.mark_clean();
    on_dirty.mockClear();

    // Sync to different content (simulates source→visual with changes)
    session.set_markdown("modified\n");

    // Since saved_markdown is still "original\n", this should be dirty
    expect(session.is_dirty()).toBe(true);
    expect(on_dirty).toHaveBeenCalledWith(true);

    session.destroy();
  });

  it("edit-then-undo is clean after mark_clean with saved_content", async () => {
    const on_dirty = vi.fn();
    const { session, container: c } = await create_session("original\n", {
      on_dirty_state_change: on_dirty,
    });
    container = c;

    // Sync to "modified" content and mark it as saved baseline
    session.set_markdown("modified\n");
    session.mark_clean("modified\n");

    expect(session.is_dirty()).toBe(false);
    on_dirty.mockClear();

    // Edit then get the markdown — should be dirty
    session.insert_text_at_cursor("extra ");
    expect(session.is_dirty()).toBe(true);

    // Restore to the saved content
    session.set_markdown("modified\n");

    // Should be clean again since we're back to saved baseline
    expect(session.is_dirty()).toBe(false);

    session.destroy();
  });
});
