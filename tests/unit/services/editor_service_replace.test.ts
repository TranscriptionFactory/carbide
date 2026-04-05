import { describe, expect, it, vi } from "vitest";
import type { EditorPort, EditorSession } from "$lib/features/editor/ports";
import { EditorService } from "$lib/features/editor/application/editor_service";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

function create_open_note(note_path: string, markdown: string): OpenNoteState {
  const path = as_note_path(note_path);
  return {
    meta: {
      id: path,
      path,
      name: note_path.split("/").at(-1)?.replace(/\.md$/i, "") ?? "",
      title: note_path.replace(/\.md$/i, ""),
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: markdown.length,
      file_type: null,
    },
    markdown: as_markdown_text(markdown),
    buffer_id: path,
    is_dirty: false,
  };
}

function create_session_with_replace(initial_markdown: string): EditorSession {
  let current_markdown = initial_markdown;
  return {
    destroy: vi.fn(),
    set_markdown: vi.fn((markdown: string) => {
      current_markdown = markdown;
    }),
    get_markdown: vi.fn(() => current_markdown),
    insert_text_at_cursor: vi.fn(),
    mark_clean: vi.fn(),
    is_dirty: vi.fn(() => false),
    focus: vi.fn(),
    open_buffer: vi.fn(),
    rename_buffer: vi.fn(),
    close_buffer: vi.fn(),
    update_find_state: vi.fn(),
    replace_at_match: vi.fn(),
    replace_all_matches: vi.fn(),
  };
}

function create_service(session: EditorSession): EditorService {
  const editor_store = new EditorStore();
  const vault_store = new VaultStore();
  const op_store = new OpStore();
  vault_store.set_vault(create_test_vault());

  const editor_port: EditorPort = {
    start_session: vi.fn(() => Promise.resolve(session)),
  };

  return new EditorService(editor_port, vault_store, editor_store, op_store, {
    on_internal_link_click: vi.fn(),
    on_external_link_click: vi.fn(),
    on_image_paste_requested: vi.fn(),
    on_file_drop_requested: vi.fn(),
  });
}

describe("EditorService replace_at_match", () => {
  it("delegates to session.replace_at_match", async () => {
    const session = create_session_with_replace("# Test");
    const service = create_service(session);

    await service.mount({
      root: {} as HTMLDivElement,
      note: create_open_note("test.md", "# Test"),
    });

    service.replace_at_match(0, "replacement");
    expect(session.replace_at_match).toHaveBeenCalledWith(0, "replacement");
  });

  it("delegates with correct index and text", async () => {
    const session = create_session_with_replace("# Test");
    const service = create_service(session);

    await service.mount({
      root: {} as HTMLDivElement,
      note: create_open_note("test.md", "# Test"),
    });

    service.replace_at_match(2, "new text");
    expect(session.replace_at_match).toHaveBeenCalledWith(2, "new text");
  });

  it("does not throw when no session exists", () => {
    const editor_store = new EditorStore();
    const vault_store = new VaultStore();
    const op_store = new OpStore();

    const editor_port: EditorPort = {
      start_session: vi.fn(() => Promise.resolve({} as EditorSession)),
    };

    const service = new EditorService(
      editor_port,
      vault_store,
      editor_store,
      op_store,
      {
        on_internal_link_click: vi.fn(),
        on_external_link_click: vi.fn(),
        on_image_paste_requested: vi.fn(),
        on_file_drop_requested: vi.fn(),
      },
    );

    expect(() => {
      service.replace_at_match(0, "text");
    }).not.toThrow();
  });
});

describe("EditorService replace_all_matches", () => {
  it("delegates to session.replace_all_matches", async () => {
    const session = create_session_with_replace("# Test");
    const service = create_service(session);

    await service.mount({
      root: {} as HTMLDivElement,
      note: create_open_note("test.md", "# Test"),
    });

    service.replace_all_matches("replacement");
    expect(session.replace_all_matches).toHaveBeenCalledWith("replacement");
  });

  it("does not throw when no session exists", () => {
    const editor_store = new EditorStore();
    const vault_store = new VaultStore();
    const op_store = new OpStore();

    const editor_port: EditorPort = {
      start_session: vi.fn(() => Promise.resolve({} as EditorSession)),
    };

    const service = new EditorService(
      editor_port,
      vault_store,
      editor_store,
      op_store,
      {
        on_internal_link_click: vi.fn(),
        on_external_link_click: vi.fn(),
        on_image_paste_requested: vi.fn(),
        on_file_drop_requested: vi.fn(),
      },
    );

    expect(() => {
      service.replace_all_matches("text");
    }).not.toThrow();
  });
});

describe("EditorService get_markdown", () => {
  it("returns markdown from session", async () => {
    const session = create_session_with_replace("# Hello");
    const service = create_service(session);

    await service.mount({
      root: {} as HTMLDivElement,
      note: create_open_note("test.md", "# Hello"),
    });

    expect(service.get_markdown()).toBe("# Hello");
  });

  it("returns empty string when no session exists", () => {
    const editor_store = new EditorStore();
    const vault_store = new VaultStore();
    const op_store = new OpStore();

    const editor_port: EditorPort = {
      start_session: vi.fn(() => Promise.resolve({} as EditorSession)),
    };

    const service = new EditorService(
      editor_port,
      vault_store,
      editor_store,
      op_store,
      {
        on_internal_link_click: vi.fn(),
        on_external_link_click: vi.fn(),
        on_image_paste_requested: vi.fn(),
        on_file_drop_requested: vi.fn(),
      },
    );

    expect(service.get_markdown()).toBe("");
  });
});
