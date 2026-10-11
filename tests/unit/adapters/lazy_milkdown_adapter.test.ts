import { beforeEach, describe, expect, it, vi } from "vitest";
import { create_lazy_editor_port } from "$lib/features/editor/adapters/lazy_editor_adapter";

const { create_prosemirror_editor_port_mock, start_session_mock } = vi.hoisted(
  () => ({
    create_prosemirror_editor_port_mock: vi.fn(),
    start_session_mock: vi.fn(),
  }),
);

vi.mock("$lib/features/editor/adapters/prosemirror_adapter", () => ({
  create_prosemirror_editor_port: create_prosemirror_editor_port_mock,
}));

describe("lazy_editor_adapter", () => {
  beforeEach(() => {
    start_session_mock.mockReset();
    create_prosemirror_editor_port_mock.mockReset();
    create_prosemirror_editor_port_mock.mockReturnValue({
      start_session: start_session_mock,
    });
  });

  it("loads the editor adapter only when a session starts", async () => {
    const session = {
      destroy: vi.fn(),
      set_markdown: vi.fn(),
      get_markdown: vi.fn().mockReturnValue(""),
      insert_text_at_cursor: vi.fn(),
      mark_clean: vi.fn(),
      is_dirty: vi.fn().mockReturnValue(false),
      focus: vi.fn(),
      open_buffer: vi.fn(),
      rename_buffer: vi.fn(),
      close_buffer: vi.fn(),
    };
    start_session_mock.mockResolvedValue(session);

    const port = create_lazy_editor_port({
      resolve_asset_url_for_vault: () => "/asset.png",
    });

    expect(create_prosemirror_editor_port_mock).not.toHaveBeenCalled();

    const result = await port.start_session({
      root: {} as HTMLDivElement,
      initial_markdown: "# hello",
      note_path: "note.md",
      vault_id: null,
      syntax_reveal_enabled: true,
      events: {
        on_markdown_change: vi.fn(),
        on_dirty_state_change: vi.fn(),
      },
    });

    expect(create_prosemirror_editor_port_mock).toHaveBeenCalledTimes(1);
    expect(start_session_mock).toHaveBeenCalledTimes(1);
    expect(result).toBe(session);
  });

  it("reuses the loaded adapter across multiple sessions", async () => {
    start_session_mock.mockResolvedValue({
      destroy: vi.fn(),
      set_markdown: vi.fn(),
      get_markdown: vi.fn().mockReturnValue(""),
      insert_text_at_cursor: vi.fn(),
      mark_clean: vi.fn(),
      is_dirty: vi.fn().mockReturnValue(false),
      focus: vi.fn(),
      open_buffer: vi.fn(),
      rename_buffer: vi.fn(),
      close_buffer: vi.fn(),
    });

    const port = create_lazy_editor_port();

    await port.start_session({
      root: {} as HTMLDivElement,
      initial_markdown: "one",
      note_path: "one.md",
      vault_id: null,
      syntax_reveal_enabled: true,
      events: {
        on_markdown_change: vi.fn(),
        on_dirty_state_change: vi.fn(),
      },
    });
    await port.start_session({
      root: {} as HTMLDivElement,
      initial_markdown: "two",
      note_path: "two.md",
      vault_id: null,
      syntax_reveal_enabled: true,
      events: {
        on_markdown_change: vi.fn(),
        on_dirty_state_change: vi.fn(),
      },
    });

    expect(create_prosemirror_editor_port_mock).toHaveBeenCalledTimes(1);
    expect(start_session_mock).toHaveBeenCalledTimes(2);
  });
});
