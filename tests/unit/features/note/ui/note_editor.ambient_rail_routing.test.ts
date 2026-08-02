/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);
vi.mock(
  "$lib/components/ui/context-menu",
  async () => import("../../../helpers/ui_stubs/context_menu_full"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { Tab } from "$lib/features/tab/types/tab";
import type { AmbientNotice } from "$lib/features/assistant";
import { ASSISTANT_PROPOSALS_TAB_ID } from "$lib/features/tab/domain/assistant_proposals_tab";
import NoteEditor from "$lib/features/note/ui/note_editor.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import { make_ambient_notice } from "../../../helpers/assistant_notice_fixtures";

const NOTE_PATH = "notes/ranking-experiments.md";

function make_open_note(path: string): OpenNoteState {
  return {
    meta: { path, id: path },
    markdown: "# hybrid retrieval",
  } as unknown as OpenNoteState;
}

function make_note_tab(path: string): Tab {
  return {
    id: path,
    title: path,
    is_pinned: false,
    is_dirty: false,
    pane: "primary",
    kind: "note",
    note_path: path,
  } as unknown as Tab;
}

function render(options: {
  notices?: AmbientNotice[];
  open_note?: OpenNoteState | null;
  tab?: Tab;
  split_view?: boolean;
}) {
  const stores = create_app_stores();
  const tab = options.tab ?? make_note_tab(NOTE_PATH);
  stores.tab.tabs = [tab];
  stores.tab.active_tab_id = tab.id;
  stores.assistant_notices.notices = options.notices ?? [];

  const open_note =
    options.open_note === undefined
      ? make_open_note(NOTE_PATH)
      : options.open_note;
  if (open_note) stores.editor.open_note = open_note;
  if (options.split_view) stores.editor.split_view = true;

  const execute = vi.fn().mockResolvedValue(undefined);
  const update_visual_editor_ambient_anchors = vi.fn();

  const view = render_with_app_context(NoteEditor, {
    app_context: {
      stores,
      action_registry: { execute } as unknown as AppContext["action_registry"],
      services: {
        editor: { update_visual_editor_ambient_anchors },
      } as unknown as AppContext["services"],
    } as unknown as Partial<AppContext>,
    props: {},
  });

  return { ...view, stores, execute, update_visual_editor_ambient_anchors };
}

function rail(target: HTMLElement) {
  return target.querySelector('[data-testid="assistant-notice-rail"]');
}

function press(target: HTMLElement, testid: string): void {
  const button = target.querySelector<HTMLButtonElement>(
    `[data-testid="${testid}"]`,
  );
  if (!button) throw new Error(`missing ${testid}`);
  button.click();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("note_editor ambient rail routing", () => {
  it("renders no rail when no note is open", () => {
    const view = render({ open_note: null, notices: [make_ambient_notice()] });

    expect(rail(view.target)).toBeNull();

    view.cleanup();
  });

  it("renders no rail when the open note has no notices", () => {
    const view = render({ notices: [] });

    expect(rail(view.target)).toBeNull();

    view.cleanup();
  });

  it("ignores notices belonging to a different note", () => {
    const view = render({
      notices: [make_ambient_notice({ note_path: "notes/other.md" })],
    });

    expect(rail(view.target)).toBeNull();

    view.cleanup();
  });

  it("renders the margin rail for the open note's notices", () => {
    const view = render({
      notices: [
        make_ambient_notice({ note_path: NOTE_PATH }),
        make_ambient_notice({ note_path: "notes/other.md" }),
      ],
    });

    expect(rail(view.target)).not.toBeNull();
    expect(
      view.target.querySelectorAll('[data-testid="assistant-notice-card"]'),
    ).toHaveLength(1);

    view.cleanup();
  });

  it("renders the rail inside the editor pane, beside the prose", () => {
    const view = render({
      notices: [make_ambient_notice({ note_path: NOTE_PATH })],
    });

    const row = view.target.querySelector(".NoteEditor__visual-row");
    expect(row).not.toBeNull();
    expect(row?.querySelector(".NoteEditor__visual-wrapper")).not.toBeNull();
    expect(
      row?.querySelector('[data-testid="assistant-notice-rail"]'),
    ).not.toBeNull();

    view.cleanup();
  });

  it("does not render the rail on a non-note tab, even with a note still open", () => {
    const view = render({
      notices: [make_ambient_notice({ note_path: NOTE_PATH })],
      tab: {
        id: ASSISTANT_PROPOSALS_TAB_ID,
        title: "Proposals",
        is_pinned: false,
        is_dirty: false,
        pane: "primary",
        kind: "assistant_proposals",
      } as unknown as Tab,
    });

    expect(rail(view.target)).toBeNull();

    view.cleanup();
  });

  // v1 scope: split view is out. The rail is absent because the split branch
  // is a different template, and the underline is suppressed too — otherwise
  // split view would show anchors with no cards explaining them.
  it("neither renders the rail nor underlines anything in split view", () => {
    const view = render({
      notices: [make_ambient_notice({ note_path: NOTE_PATH })],
      split_view: true,
    });

    expect(rail(view.target)).toBeNull();
    expect(view.update_visual_editor_ambient_anchors).toHaveBeenCalledWith([]);
    expect(view.update_visual_editor_ambient_anchors).not.toHaveBeenCalledWith([
      expect.anything(),
    ]);

    view.cleanup();
  });

  it("pushes the open note's notices to the editor for underlining", () => {
    const notice = make_ambient_notice({ note_path: NOTE_PATH });
    const view = render({ notices: [notice] });

    expect(view.update_visual_editor_ambient_anchors).toHaveBeenCalledWith([
      notice,
    ]);

    view.cleanup();
  });

  // Offer-only: the card dispatches an action id. It never reaches the store's
  // mutators and never touches the note buffer.
  it("dispatches assistant_accept_notice with the id, not a store mutator", () => {
    const notice = make_ambient_notice({ note_path: NOTE_PATH });
    const view = render({ notices: [notice] });

    press(view.target, "assistant-notice-offer");

    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.assistant_accept_notice,
      notice.id,
    );

    view.cleanup();
  });

  it("dispatches assistant_dismiss_notice with the id", () => {
    const notice = make_ambient_notice({ note_path: NOTE_PATH });
    const view = render({ notices: [notice] });

    press(view.target, "assistant-notice-dismiss");

    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.assistant_dismiss_notice,
      notice.id,
    );

    view.cleanup();
  });

  it("writes nothing to the note buffer when either card action is pressed", () => {
    const notice = make_ambient_notice({ note_path: NOTE_PATH });
    const view = render({ notices: [notice] });
    const set_markdown = vi.spyOn(view.stores.editor, "set_markdown");
    const set_dirty = vi.spyOn(view.stores.editor, "set_dirty");
    const markdown_before = view.stores.editor.open_note?.markdown;

    press(view.target, "assistant-notice-offer");
    press(view.target, "assistant-notice-dismiss");

    expect(set_markdown).not.toHaveBeenCalled();
    expect(set_dirty).not.toHaveBeenCalled();
    expect(view.stores.editor.open_note?.markdown).toBe(markdown_before);

    view.cleanup();
  });
});
