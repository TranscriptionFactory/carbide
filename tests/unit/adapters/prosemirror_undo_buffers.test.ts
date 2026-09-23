/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import { toggle_format } from "$lib/features/editor/adapters/formatting_toolbar_commands";
import type { EditorSession } from "$lib/features/editor/ports";

async function start(initial_markdown: string): Promise<EditorSession> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return create_prosemirror_editor_port().start_session({
    root,
    initial_markdown,
    note_path: "a.md",
    vault_id: null,
    events: {
      on_markdown_change: vi.fn(),
      on_dirty_state_change: vi.fn(),
    },
  });
}

function view_of(session: EditorSession) {
  const view = session.get_view?.();
  if (!view) throw new Error("session exposes no view");
  return view;
}

function type_at_end(session: EditorSession, text: string) {
  const view = view_of(session);
  const end = view.state.doc.content.size - 1;
  view.dispatch(view.state.tr.insertText(text, end));
}

function switch_to(
  session: EditorSession,
  note_path: string,
  markdown: string,
) {
  session.open_buffer({
    note_path,
    vault_id: null,
    initial_markdown: markdown,
    restore_policy: "reuse_cache",
  });
}

describe("prosemirror undo across buffers", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("undoes an edit after switching A→B→A", async () => {
    const session = await start("alpha\n");
    type_at_end(session, " edited");
    const a_markdown = session.get_markdown();
    expect(a_markdown).toBe("alpha edited\n");

    switch_to(session, "b.md", "bravo\n");
    switch_to(session, "a.md", a_markdown);

    expect(toggle_format("undo", view_of(session))).toBe(true);
    expect(session.get_markdown()).toBe("alpha\n");
    session.destroy();
  });

  it("keeps undo history per note", async () => {
    const session = await start("alpha\n");
    type_at_end(session, " one");
    const a_markdown = session.get_markdown();

    switch_to(session, "b.md", "bravo\n");
    expect(toggle_format("undo", view_of(session))).toBe(false);
    expect(session.get_markdown()).toBe("bravo\n");

    type_at_end(session, " two");
    expect(toggle_format("undo", view_of(session))).toBe(true);
    expect(session.get_markdown()).toBe("bravo\n");

    switch_to(session, "a.md", a_markdown);
    expect(session.get_markdown()).toBe("alpha one\n");
    session.destroy();
  });

  it("redoes an undone edit", async () => {
    const session = await start("alpha\n");
    type_at_end(session, " edited");
    const view = view_of(session);

    expect(toggle_format("undo", view)).toBe(true);
    expect(session.get_markdown()).toBe("alpha\n");
    expect(toggle_format("redo", view)).toBe(true);
    expect(session.get_markdown()).toBe("alpha edited\n");
    session.destroy();
  });
});
