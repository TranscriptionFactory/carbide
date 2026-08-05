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
import type { EditorMode, OpenNoteState } from "$lib/shared/types/editor";
import type { Tab } from "$lib/features/tab/types/tab";
import NoteEditor from "$lib/features/note/ui/note_editor.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";

const NOTE_PATH = "notes/ranking-experiments.md";

function render(options: { editor_mode?: EditorMode } = {}) {
  const stores = create_app_stores();
  const tab = {
    id: NOTE_PATH,
    title: NOTE_PATH,
    is_pinned: false,
    is_dirty: false,
    pane: "primary",
    kind: "note",
    note_path: NOTE_PATH,
  } as unknown as Tab;
  stores.tab.tabs = [tab];
  stores.tab.active_tab_id = tab.id;
  stores.editor.open_note = {
    meta: { path: NOTE_PATH, id: NOTE_PATH },
    markdown: "# hybrid retrieval",
  } as unknown as OpenNoteState;
  if (options.editor_mode) stores.editor.editor_mode = options.editor_mode;

  const view = render_with_app_context(NoteEditor, {
    app_context: {
      stores,
      action_registry: {
        execute: vi.fn().mockResolvedValue(undefined),
      } as unknown as AppContext["action_registry"],
      services: {
        editor: { update_visual_editor_ambient_anchors: vi.fn() },
      } as unknown as AppContext["services"],
    } as unknown as Partial<AppContext>,
    props: {},
  });

  return { ...view, stores };
}

function visual_row(target: HTMLElement) {
  const row = target.querySelector(".NoteEditor__visual-row");
  if (!row) throw new Error("missing .NoteEditor__visual-row");
  return row;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("note_editor source mode layout", () => {
  it("lays out the visual row in visual mode", () => {
    const view = render({ editor_mode: "visual" });

    expect(visual_row(view.target).classList).not.toContain(
      "NoteEditor__hidden",
    );

    view.cleanup();
  });

  it("lays out the visual row in read-only mode", () => {
    const view = render({ editor_mode: "read_only" });

    expect(visual_row(view.target).classList).not.toContain(
      "NoteEditor__hidden",
    );

    view.cleanup();
  });

  // Regression: the visual row kept flex: 1 while merely emptied in source
  // mode, so it consumed half the pane and pushed the source editor down.
  it("hides the visual row in source mode so the source editor gets the full pane", () => {
    const view = render({ editor_mode: "source" });

    expect(visual_row(view.target).classList).toContain("NoteEditor__hidden");

    view.cleanup();
  });
});
