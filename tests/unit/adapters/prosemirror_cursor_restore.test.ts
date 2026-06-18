/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import type { EditorSession } from "$lib/features/editor/ports";

async function start_session(
  root: HTMLElement,
  initial_markdown: string,
): Promise<EditorSession> {
  const port = create_prosemirror_editor_port();
  return port.start_session({
    root,
    initial_markdown,
    note_path: "a.md",
    vault_id: null,
    events: {
      on_markdown_change: vi.fn(),
      on_dirty_state_change: vi.fn(),
      on_cursor_change: vi.fn(),
      on_selection_change: vi.fn(),
    },
  });
}

function cursor_pos(session: EditorSession): number {
  const view = session.get_view?.();
  if (!view) throw new Error("expected a live editor view");
  return view.state.selection.from;
}

function doc_end(session: EditorSession): number {
  const view = session.get_view?.();
  if (!view) throw new Error("expected a live editor view");
  return view.state.doc.content.size;
}

describe("prosemirror buffer cursor restore on reuse_cache rebuild", () => {
  let container: HTMLElement | null = null;

  afterEach(() => {
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
  });

  it("lands the cursor at the saved markdown offset, not at doc end", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    container = root;

    const session = await start_session(root, "first note\n");
    const target_markdown = "hello world\n";

    session.open_buffer({
      note_path: "fresh.md",
      vault_id: null,
      initial_markdown: target_markdown,
      restore_policy: "reuse_cache",
      restore_cursor_offset: 5,
    });

    expect(cursor_pos(session)).toBeLessThan(doc_end(session));
    expect(session.get_cursor_markdown_offset?.()).toBe(5);

    session.destroy();
  });

  it("restores a document-start cursor at offset 0", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    container = root;

    const session = await start_session(root, "first note\n");

    session.open_buffer({
      note_path: "fresh.md",
      vault_id: null,
      initial_markdown: "hello world\n",
      restore_policy: "reuse_cache",
      restore_cursor_offset: 0,
    });

    expect(cursor_pos(session)).toBe(0);
    expect(session.get_cursor_markdown_offset?.()).toBe(0);

    session.destroy();
  });

  it("clamps an offset beyond the document to doc.content.size", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    container = root;

    const session = await start_session(root, "first note\n");

    session.open_buffer({
      note_path: "fresh.md",
      vault_id: null,
      initial_markdown: "hi\n",
      restore_policy: "reuse_cache",
      restore_cursor_offset: 9999,
    });

    expect(cursor_pos(session)).toBe(doc_end(session));

    session.destroy();
  });
});
