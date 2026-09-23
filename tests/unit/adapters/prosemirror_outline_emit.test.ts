/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import type { OutlineHeading } from "$lib/features/outline";

async function start(initial_markdown: string) {
  const on_outline_change = vi.fn<(headings: OutlineHeading[]) => void>();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const session = await create_prosemirror_editor_port().start_session({
    root,
    initial_markdown,
    note_path: "outline.md",
    vault_id: null,
    events: {
      on_markdown_change: vi.fn(),
      on_dirty_state_change: vi.fn(),
      on_cursor_change: vi.fn(),
      on_selection_change: vi.fn(),
      on_outline_change,
    },
  });
  const view = session.get_view?.();
  if (!view) throw new Error("session has no view");
  vi.runAllTimers();
  on_outline_change.mockClear();
  return { session, view, on_outline_change };
}

describe("outline emission", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("skips the emit when typing only shifts heading positions", async () => {
    const { session, view, on_outline_change } =
      await start("intro\n\n# Title\n");
    const before = session.heading_position?.("h-1-title-0");

    view.dispatch(view.state.tr.insertText("more ", 1));
    vi.runAllTimers();

    expect(on_outline_change).not.toHaveBeenCalled();
    expect(session.heading_position?.("h-1-title-0")).toBe((before ?? 0) + 5);
    session.destroy();
  });

  it("emits once when a heading is retitled", async () => {
    const { session, view, on_outline_change } =
      await start("# Title\n\nbody\n");

    view.dispatch(view.state.tr.insertText("!", 6));
    vi.runAllTimers();

    expect(on_outline_change).toHaveBeenCalledTimes(1);
    expect(on_outline_change.mock.calls[0]?.[0].map((h) => h.text)).toEqual([
      "Title!",
    ]);
    session.destroy();
  });
});
