/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import type { EditorSession } from "$lib/features/editor/ports";
import {
  DEFAULT_FIND_OPTIONS,
  type FindMatchesUpdate,
} from "$lib/features/editor/domain/find_types";

let container: HTMLElement | null = null;

async function create_session(
  initial_markdown: string,
): Promise<EditorSession> {
  container = document.createElement("div");
  document.body.appendChild(container);

  const port = create_prosemirror_editor_port();
  return port.start_session({
    root: container,
    initial_markdown,
    note_path: "test.md",
    vault_id: null,
    events: {
      on_markdown_change: vi.fn(),
      on_dirty_state_change: vi.fn(),
      on_cursor_change: vi.fn(),
      on_selection_change: vi.fn(),
    },
  });
}

afterEach(() => {
  if (container) {
    document.body.removeChild(container);
    container = null;
  }
});

describe("prosemirror find session", () => {
  it("publishes a fresh count after new matching text is typed", async () => {
    const session = await create_session("foo bar");
    const updates: FindMatchesUpdate[] = [];

    const initial = session.update_find_state?.(
      "foo",
      0,
      DEFAULT_FIND_OPTIONS,
      (update) => updates.push(update),
    );
    expect(initial).toBe(1);

    session.focus();
    session.insert_text_at_cursor("foo ");

    expect(updates.at(-1)?.match_count).toBe(2);
  });

  it("keeps replace working when the requested index outran the match list", async () => {
    const session = await create_session("foo foo foo");

    session.update_find_state?.("foo", 2, DEFAULT_FIND_OPTIONS);
    const result = session.replace_at_match?.(9, "baz");

    expect(result?.match_count).toBe(2);
    expect(session.get_markdown()).toContain("baz");
  });
});
