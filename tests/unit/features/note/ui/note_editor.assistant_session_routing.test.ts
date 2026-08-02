/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { Tab } from "$lib/features/tab/types/tab";
import NoteEditor from "$lib/features/note/ui/note_editor.svelte";
import { assistant_session_tab_id } from "$lib/features/tab/domain/assistant_session_tab";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import { make_session } from "../../../helpers/assistant_session_fixtures";

function make_assistant_tab(session_id: string): Tab {
  return {
    id: assistant_session_tab_id(session_id),
    title: "Assistant",
    is_pinned: false,
    is_dirty: false,
    pane: "primary",
    kind: "assistant_session",
    session_id,
  };
}

function make_open_note(path: string): OpenNoteState {
  return {
    meta: { path, id: path },
    markdown: "# a previously open note",
  } as unknown as OpenNoteState;
}

function render(options: {
  session_id: string;
  sessions?: ReturnType<typeof make_session>[];
  open_note?: OpenNoteState | null;
}) {
  const stores = create_app_stores();
  const tab = make_assistant_tab(options.session_id);
  stores.tab.tabs = [tab];
  stores.tab.active_tab_id = tab.id;
  stores.assistant_sessions.sessions = options.sessions ?? [];
  if (options.open_note) stores.editor.open_note = options.open_note;

  const view = render_with_app_context(NoteEditor, {
    app_context: {
      stores,
      action_registry: { execute: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Partial<AppContext>,
    props: {},
  });

  return { ...view, stores };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("note_editor routing for assistant_session tabs", () => {
  it("renders the session surface for an active assistant tab", () => {
    const view = render({
      session_id: "s1",
      sessions: [make_session({ id: "s1", title: "How do backlinks work?" })],
    });

    const surface = view.target.querySelector(
      '[data-testid="assistant-session-tab"]',
    );
    expect(surface).not.toBeNull();
    expect(
      view.target.querySelector('[data-testid="assistant-session-title"]')
        ?.textContent,
    ).toContain("How do backlinks work?");

    view.cleanup();
  });

  it("does not fall through to the editor of a previously open note", () => {
    const view = render({
      session_id: "s1",
      sessions: [make_session({ id: "s1" })],
      open_note: make_open_note("docs/alpha.md"),
    });

    expect(
      view.target.querySelector('[data-testid="assistant-session-tab"]'),
    ).not.toBeNull();
    expect(view.target.querySelector(".NoteEditor__content")).toBeNull();
    expect(view.target.querySelector(".NoteEditor__visual-wrapper")).toBeNull();
    expect(view.target.textContent).not.toContain("a previously open note");

    view.cleanup();
  });

  it("renders the pruned-session empty state inside the tab", () => {
    const view = render({
      session_id: "pruned",
      sessions: [make_session({ id: "other" })],
      open_note: make_open_note("docs/alpha.md"),
    });

    const empty = view.target.querySelector('[data-testid="empty-message"]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain(
      "This conversation is no longer available",
    );
    expect(view.target.querySelector(".NoteEditor__content")).toBeNull();

    view.cleanup();
  });
});
