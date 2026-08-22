/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { embed_src_matches_path } from "$lib/features/editor/adapters/note_embed_view_plugin";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import { undoDepth } from "prosemirror-history";

describe("embed_src_matches_path", () => {
  it("matches a name-only src against a nested fs path", () => {
    expect(
      embed_src_matches_path("Meeting Notes", "work/Meeting Notes.md"),
    ).toBe(true);
  });

  it("matches an exact path src with extension stripped", () => {
    expect(embed_src_matches_path("work/plan", "work/plan.md")).toBe(true);
  });

  it("matches case-insensitively like wiki link resolution", () => {
    expect(embed_src_matches_path("readme", "docs/README.md")).toBe(true);
  });

  it("rejects a different note whose name merely ends with the src", () => {
    expect(embed_src_matches_path("plan", "work/master-plan.md")).toBe(false);
  });

  it("rejects unrelated paths", () => {
    expect(embed_src_matches_path("alpha", "beta.md")).toBe(false);
  });
});

describe("note embed collapse", () => {
  it("updates persisted markdown without adding an undo entry", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const port = create_prosemirror_editor_port({
      note_embed: {
        read_note: vi.fn().mockResolvedValue("embedded content"),
        subscribe_to_changes: () => vi.fn(),
      },
    });
    const session = await port.start_session({
      root,
      initial_markdown: "![[note]]\n",
      note_path: "host.md",
      vault_id: null,
      events: {
        on_markdown_change: vi.fn(),
        on_dirty_state_change: vi.fn(),
        on_cursor_change: vi.fn(),
        on_selection_change: vi.fn(),
      },
    });
    const view = session.get_view?.();
    const button = root.querySelector<HTMLButtonElement>(
      ".note-embed__collapse",
    );
    if (!view || !button) throw new Error("missing note embed view");
    const undo_depth: unknown = undoDepth(view.state);

    button.click();

    expect(undoDepth(view.state)).toBe(undo_depth);
    expect(session.get_markdown().trim()).toBe("![[note|collapsed]]");
    expect(session.is_dirty()).toBe(true);

    button.click();

    expect(undoDepth(view.state)).toBe(undo_depth);
    expect(session.get_markdown().trim()).toBe("![[note]]");
    expect(session.is_dirty()).toBe(false);
    session.destroy();
    root.remove();
  });
});
