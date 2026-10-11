/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import type {
  EditorPort,
  EditorSession,
  EditorSessionConfig,
} from "$lib/features/editor/ports";
import { EditorService } from "$lib/features/editor/application/editor_service";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

function create_open_note(): OpenNoteState {
  const path = as_note_path("docs/alpha.md");
  return {
    meta: {
      id: path,
      path,
      name: "alpha",
      title: "alpha",
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 7,
      file_type: null,
    },
    markdown: as_markdown_text("# Alpha"),
    buffer_id: path,
    is_dirty: false,
  };
}

function create_session(): EditorSession {
  return {
    destroy: vi.fn(),
    set_markdown: vi.fn(),
    get_markdown: vi.fn(() => ""),
    insert_text_at_cursor: vi.fn(),
    replace_selection: vi.fn(),
    get_selected_text: vi.fn(() => null),
    mark_clean: vi.fn(),
    is_dirty: vi.fn(() => false),
    focus: vi.fn(),
    open_buffer: vi.fn(),
    rename_buffer: vi.fn(),
    close_buffer: vi.fn(),
    get_view: () => null,
  } as unknown as EditorSession;
}

function create_setup() {
  const editor_store = new EditorStore();
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());
  const start_session = vi.fn((_config: EditorSessionConfig) =>
    Promise.resolve(create_session()),
  );
  const editor_port: EditorPort = { start_session };
  const service = new EditorService(
    editor_port,
    vault_store,
    editor_store,
    new OpStore(),
    {
      on_internal_link_click: vi.fn(),
      on_external_link_click: vi.fn(),
      on_image_paste_requested: vi.fn(),
      on_file_drop_requested: vi.fn(),
    },
  );
  const note = create_open_note();
  editor_store.set_open_note(note);
  return { service, start_session, note };
}

function flags(
  start_session: ReturnType<typeof create_setup>["start_session"],
) {
  return start_session.mock.calls.map(
    ([config]) => config.syntax_reveal_enabled,
  );
}

describe("EditorService syntax reveal flag", () => {
  it("starts sessions with reveal on by default", async () => {
    const { service, start_session, note } = create_setup();

    await service.mount({ root: document.createElement("div"), note });

    expect(flags(start_session)).toEqual([true]);
  });

  it("recreates the mounted session when toggled at runtime", async () => {
    const { service, start_session, note } = create_setup();
    await service.mount({ root: document.createElement("div"), note });

    await service.set_syntax_reveal(false);

    expect(flags(start_session)).toEqual([true, false]);
  });

  it("does not recreate the session when the value is unchanged", async () => {
    const { service, start_session, note } = create_setup();
    await service.mount({ root: document.createElement("div"), note });

    await service.set_syntax_reveal(true);

    expect(start_session).toHaveBeenCalledTimes(1);
  });

  it("keeps the flag off across a remount", async () => {
    const { service, start_session, note } = create_setup();
    await service.set_syntax_reveal(false);

    await service.mount({ root: document.createElement("div"), note });
    service.unmount();
    await service.mount({ root: document.createElement("div"), note });

    expect(flags(start_session)).toEqual([false, false]);
  });
});
