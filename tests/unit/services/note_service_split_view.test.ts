import { describe, expect, it, vi } from "vitest";
import { NoteService } from "$lib/features/note/application/note_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
import {
  create_mock_index_port,
  create_mock_notes_port,
} from "../helpers/mock_ports";
import type { EditorService } from "$lib/features/editor/application/editor_service";
import type { AssetsPort } from "$lib/features/note/ports";
import type { SplitViewService } from "$lib/features/split_view";

function create_mock_editor_service(): EditorService {
  return {
    flush: vi.fn().mockReturnValue(null),
    mark_clean: vi.fn(),
    rename_buffer: vi.fn(),
  } as unknown as EditorService;
}

function create_mock_assets_port(): AssetsPort {
  return {
    resolve_asset_url: vi.fn(),
    write_image_asset: vi.fn(),
  } as unknown as AssetsPort;
}

function create_note_meta(id: string) {
  return {
    id: as_note_path(id),
    path: as_note_path(id),
    name: id.split("/").at(-1)?.replace(/\.md$/, "") ?? id,
    title: id,
    mtime_ms: 1000,
    size_bytes: 0,
  };
}

function create_mock_split_view_service(
  overrides: Partial<SplitViewService> = {},
): SplitViewService {
  return {
    is_active: vi.fn().mockReturnValue(false),
    get_active_pane: vi.fn().mockReturnValue("primary"),
    is_same_note_in_both_panes: vi.fn().mockReturnValue(false),
    propagate_mtime_to_secondary: vi.fn(),
    get_secondary_editor_store: vi.fn().mockReturnValue(null),
    get_secondary_editor: vi.fn().mockReturnValue(null),
    get_secondary_open_note: vi.fn().mockReturnValue(null),
    sync_secondary_note_state: vi.fn(),
    ...overrides,
  } as unknown as SplitViewService;
}

function build_note_service(
  vault_store: VaultStore,
  notes_store: NotesStore,
  editor_store: EditorStore,
  op_store: OpStore,
  split_view_service?: SplitViewService,
) {
  const notes_port = create_mock_notes_port();
  const index_port = create_mock_index_port();
  const assets_port = create_mock_assets_port();
  const editor_service = create_mock_editor_service();

  return {
    service: new NoteService(
      notes_port,
      index_port,
      assets_port,
      vault_store,
      notes_store,
      editor_store,
      op_store,
      editor_service,
      () => 1,
      null,
      undefined,
      split_view_service,
    ),
    notes_port,
  };
}

describe("NoteService split-view mtime propagation", () => {
  it("propagates mtime to secondary pane after primary save", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const primary_store = new EditorStore();
    const secondary_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const note_meta = create_note_meta("notes/alpha.md");
    notes_store.set_notes([note_meta]);
    primary_store.set_open_note({
      meta: note_meta,
      markdown: as_markdown_text("# Alpha"),
      buffer_id: note_meta.id,
      is_dirty: true,
    });
    secondary_store.set_open_note({
      meta: note_meta,
      markdown: as_markdown_text("# Alpha"),
      buffer_id: note_meta.id,
      is_dirty: false,
    });

    const propagate_spy = vi.fn();
    const split_view_service = create_mock_split_view_service({
      is_active: vi.fn().mockReturnValue(true),
      get_active_pane: vi.fn().mockReturnValue("primary"),
      is_same_note_in_both_panes: vi.fn().mockReturnValue(false),
      propagate_mtime_to_secondary: propagate_spy,
    });

    const { service, notes_port } = build_note_service(
      vault_store,
      notes_store,
      primary_store,
      op_store,
      split_view_service,
    );

    const fixed_mtime = 9999;
    notes_port.write_and_index_note = vi
      .fn()
      .mockResolvedValue({ new_mtime: fixed_mtime });

    const result = await service.save_note(null, true, "primary");

    expect(result.status).toBe("saved");
    expect(propagate_spy).toHaveBeenCalledWith(note_meta.id, fixed_mtime);
  });

  it("propagates mtime to primary store after secondary save", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const primary_store = new EditorStore();
    const secondary_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const primary_meta = create_note_meta("notes/alpha.md");
    const secondary_meta = { ...primary_meta };

    notes_store.set_notes([primary_meta]);
    primary_store.set_open_note({
      meta: primary_meta,
      markdown: as_markdown_text("# Alpha"),
      buffer_id: primary_meta.id,
      is_dirty: false,
    });
    secondary_store.set_open_note({
      meta: secondary_meta,
      markdown: as_markdown_text("# Alpha"),
      buffer_id: secondary_meta.id,
      is_dirty: true,
    });

    const secondary_editor_service = create_mock_editor_service();
    const split_view_service = create_mock_split_view_service({
      is_active: vi.fn().mockReturnValue(true),
      get_active_pane: vi.fn().mockReturnValue("secondary"),
      is_same_note_in_both_panes: vi.fn().mockReturnValue(false),
      get_secondary_editor_store: vi.fn().mockReturnValue(secondary_store),
      get_secondary_editor: vi.fn().mockReturnValue(secondary_editor_service),
      propagate_mtime_to_secondary: vi.fn(),
    });

    const { service, notes_port } = build_note_service(
      vault_store,
      notes_store,
      primary_store,
      op_store,
      split_view_service,
    );

    const fixed_mtime = 7777;
    notes_port.write_and_index_note = vi
      .fn()
      .mockResolvedValue({ new_mtime: fixed_mtime });

    await service.save_note(null, true, "secondary");

    expect(primary_store.open_note?.meta.mtime_ms).toBe(fixed_mtime);
  });

  it("saves from either pane when both panes have same note", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const primary_store = new EditorStore();
    const secondary_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const note_meta = create_note_meta("notes/shared.md");
    notes_store.set_notes([note_meta]);
    primary_store.set_open_note({
      meta: note_meta,
      markdown: as_markdown_text("# Shared"),
      buffer_id: note_meta.id,
      is_dirty: true,
    });
    secondary_store.set_open_note({
      meta: note_meta,
      markdown: as_markdown_text("# Shared"),
      buffer_id: note_meta.id,
      is_dirty: true,
    });

    const secondary_editor_service = create_mock_editor_service();
    const split_view_service = create_mock_split_view_service({
      is_active: vi.fn().mockReturnValue(true),
      get_active_pane: vi.fn().mockReturnValue("primary"),
      is_same_note_in_both_panes: vi.fn().mockReturnValue(true),
      get_secondary_editor_store: vi.fn().mockReturnValue(secondary_store),
      get_secondary_editor: vi.fn().mockReturnValue(secondary_editor_service),
      propagate_mtime_to_secondary: vi.fn(),
    });

    const { service, notes_port } = build_note_service(
      vault_store,
      notes_store,
      primary_store,
      op_store,
      split_view_service,
    );

    notes_port.write_and_index_note = vi
      .fn()
      .mockResolvedValue({ new_mtime: Date.now() });

    const result = await service.save_note(null, true, "primary");

    expect(result.status).toBe("saved");
  });

  it("both panes can save independently when notes differ", async () => {
    const vault_store = new VaultStore();
    const notes_store = new NotesStore();
    const primary_store = new EditorStore();
    const secondary_store = new EditorStore();
    const op_store = new OpStore();

    vault_store.set_vault(create_test_vault());

    const primary_meta = create_note_meta("notes/alpha.md");
    const secondary_meta = create_note_meta("notes/beta.md");
    notes_store.set_notes([primary_meta, secondary_meta]);

    primary_store.set_open_note({
      meta: primary_meta,
      markdown: as_markdown_text("# Alpha"),
      buffer_id: primary_meta.id,
      is_dirty: true,
    });
    secondary_store.set_open_note({
      meta: secondary_meta,
      markdown: as_markdown_text("# Beta"),
      buffer_id: secondary_meta.id,
      is_dirty: true,
    });

    const secondary_editor_service = create_mock_editor_service();
    const split_view_service = create_mock_split_view_service({
      is_active: vi.fn().mockReturnValue(true),
      get_active_pane: vi.fn().mockReturnValue("primary"),
      is_same_note_in_both_panes: vi.fn().mockReturnValue(false),
      get_secondary_editor_store: vi.fn().mockReturnValue(secondary_store),
      get_secondary_editor: vi.fn().mockReturnValue(secondary_editor_service),
      propagate_mtime_to_secondary: vi.fn(),
    });

    const { service, notes_port } = build_note_service(
      vault_store,
      notes_store,
      primary_store,
      op_store,
      split_view_service,
    );

    notes_port.write_and_index_note = vi
      .fn()
      .mockResolvedValue({ new_mtime: Date.now() });

    const primary_result = await service.save_note(null, true, "primary");
    const secondary_result = await service.save_note(null, true, "secondary");

    expect(primary_result.status).toBe("saved");
    expect(secondary_result.status).toBe("saved");
  });
});
