import { describe, expect, it, vi } from "vitest";
import { LinkRepairService } from "$lib/features/links/application/link_repair_service";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import {
  as_markdown_text,
  as_note_path,
  type NoteId,
} from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
import {
  create_mock_index_port,
  create_mock_notes_port,
} from "../helpers/mock_ports";
import type { SearchPort } from "$lib/features/search/ports";

const VAULT_ID = create_test_vault().id;
const SOURCE_PATH = "docs/source.md";
const RENAME_MAP = new Map([["docs/old.md", "docs/new.md"]]);

const SOURCE_NOTE = {
  id: as_note_path(SOURCE_PATH),
  path: as_note_path(SOURCE_PATH),
  name: "source",
  title: "source",
  blurb: "",
  mtime_ms: 0,
  ctime_ms: 0,
  size_bytes: 0,
  file_type: null,
};

const BACKLINKS_SNAPSHOT = {
  backlinks: [{ path: SOURCE_PATH }],
  outlinks: [],
  orphan_links: [],
};

const EMPTY_SNAPSHOT = {
  backlinks: [],
  outlinks: [],
  orphan_links: [],
};

function create_mock_search_port(overrides?: Partial<SearchPort>): SearchPort {
  return {
    search_notes: vi.fn(),
    suggest_wiki_links: vi.fn(),
    suggest_planned_links: vi.fn(),
    get_note_links_snapshot: vi.fn().mockResolvedValue(EMPTY_SNAPSHOT),
    extract_local_note_links: vi.fn(),
    rewrite_note_links: vi
      .fn()
      .mockImplementation((markdown: string) =>
        Promise.resolve({ markdown, changed: false }),
      ),
    resolve_note_link: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as SearchPort;
}

function rewrite_always_changed() {
  return vi
    .fn()
    .mockResolvedValue({ markdown: "See [Old](new.md)", changed: true });
}

describe("LinkRepairService", () => {
  it("rewrites inbound backlink sources on disk", async () => {
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();

    notes_port.read_note = vi
      .fn()
      .mockImplementation((_vid: unknown, note_id: NoteId) => {
        if (String(note_id) === SOURCE_PATH) {
          return Promise.resolve({
            meta: SOURCE_NOTE,
            markdown: as_markdown_text("See [Old](old.md)"),
          });
        }
        return Promise.resolve({
          meta: { ...SOURCE_NOTE, id: note_id, path: as_note_path(note_id) },
          markdown: as_markdown_text("# Content"),
        });
      });

    const search_port = create_mock_search_port({
      get_note_links_snapshot: vi.fn().mockResolvedValue(BACKLINKS_SNAPSHOT),
      rewrite_note_links: rewrite_always_changed(),
    });

    const service = new LinkRepairService(
      notes_port,
      search_port,
      index_port,
      editor_store,
      tab_store,
      () => 1,
    );

    const result = await service.repair_links(VAULT_ID, RENAME_MAP);

    expect(notes_port._calls.write_note).toContainEqual({
      vault_id: VAULT_ID,
      note_id: as_note_path(SOURCE_PATH),
      markdown: as_markdown_text("See [Old](new.md)"),
    });
    expect(index_port._calls.upsert_note).toContainEqual({
      vault_id: VAULT_ID,
      note_id: as_note_path(SOURCE_PATH),
    });
    expect(result).toEqual({
      scanned: 2,
      rewritten: 2,
      failed: [],
    });
  });

  it("updates open dirty editor note in-memory instead of writing to disk", async () => {
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();

    editor_store.set_open_note({
      meta: SOURCE_NOTE,
      markdown: as_markdown_text("See [Old](old.md)"),
      buffer_id: "source-buffer",
      is_dirty: true,
    });

    const search_port = create_mock_search_port({
      get_note_links_snapshot: vi.fn().mockResolvedValue(BACKLINKS_SNAPSHOT),
      rewrite_note_links: vi
        .fn()
        .mockImplementation(
          (
            markdown: string,
            old_source: string,
            new_source: string,
            _map: Record<string, string>,
          ) => {
            if (old_source === new_source) {
              return Promise.resolve({
                markdown: "See [Old](new.md)",
                changed: true,
              });
            }
            return Promise.resolve({ markdown, changed: false });
          },
        ),
    });

    const service = new LinkRepairService(
      notes_port,
      search_port,
      index_port,
      editor_store,
      tab_store,
      () => 1,
    );

    await service.repair_links(VAULT_ID, RENAME_MAP);

    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("See [Old](new.md)"),
    );
    expect(editor_store.open_note?.is_dirty).toBe(true);
    expect(editor_store.open_note?.buffer_id).toContain(":repair-links:");
    expect(notes_port._calls.write_note).toEqual([]);
  });

  it("invalidates tab cache and editor buffer for background notes", async () => {
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();
    const close_editor_buffer = vi.fn();

    const source_tab = tab_store.open_tab(SOURCE_NOTE.path, SOURCE_NOTE.title);
    tab_store.set_cached_note(source_tab.id, {
      meta: SOURCE_NOTE,
      markdown: as_markdown_text("See [Old](old.md)"),
      buffer_id: "source-buffer",
      is_dirty: false,
    });

    notes_port.read_note = vi.fn().mockResolvedValue({
      meta: SOURCE_NOTE,
      markdown: as_markdown_text("See [Old](old.md)"),
    });

    const search_port = create_mock_search_port({
      get_note_links_snapshot: vi.fn().mockResolvedValue(BACKLINKS_SNAPSHOT),
      rewrite_note_links: rewrite_always_changed(),
    });

    const service = new LinkRepairService(
      notes_port,
      search_port,
      index_port,
      editor_store,
      tab_store,
      () => 1,
      close_editor_buffer,
    );

    await service.repair_links(VAULT_ID, RENAME_MAP);

    expect(tab_store.get_cached_note(source_tab.id)).toBeNull();
    expect(close_editor_buffer).toHaveBeenCalledWith(as_note_path(SOURCE_PATH));
  });

  it("does nothing when path map has no backlinks", async () => {
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();

    const rewrite_note_links = vi
      .fn()
      .mockResolvedValue({ markdown: "# Content", changed: false });
    const search_port = create_mock_search_port({
      get_note_links_snapshot: vi.fn().mockResolvedValue(EMPTY_SNAPSHOT),
      rewrite_note_links,
    });

    const service = new LinkRepairService(
      notes_port,
      search_port,
      index_port,
      editor_store,
      tab_store,
      () => 1,
    );

    await service.repair_links(VAULT_ID, RENAME_MAP);

    expect(notes_port._calls.write_note).toEqual([]);
    expect(rewrite_note_links).toHaveBeenCalled();
  });

  it("rewrites outlinks of moved note even when editor has old path", async () => {
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();

    const old_path = "a/b/noteA.md";
    const new_path = "noteA.md";
    const old_note = {
      id: as_note_path(old_path),
      path: as_note_path(old_path),
      name: "noteA",
      title: "noteA",
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
    };

    editor_store.set_open_note({
      meta: old_note,
      markdown: as_markdown_text("[../../Testing](../../Testing.md)"),
      buffer_id: "buffer-a",
      is_dirty: false,
    });

    const rewrite_note_links = vi.fn().mockResolvedValue({
      markdown: "[Testing](Testing.md)",
      changed: true,
    });

    const search_port = create_mock_search_port({
      get_note_links_snapshot: vi.fn().mockResolvedValue(EMPTY_SNAPSHOT),
      rewrite_note_links,
    });

    const service = new LinkRepairService(
      notes_port,
      search_port,
      index_port,
      editor_store,
      tab_store,
      () => 1,
    );

    const path_map = new Map([[old_path, new_path]]);
    await service.repair_links(VAULT_ID, path_map);

    expect(rewrite_note_links).toHaveBeenCalledWith(
      "[../../Testing](../../Testing.md)",
      old_path,
      new_path,
      { [old_path]: new_path },
    );

    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("[Testing](Testing.md)"),
    );
    expect(editor_store.open_note?.buffer_id).toContain(":repair-links:");
  });

  it("calls on_file_written with note path before write for closed notes", async () => {
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();
    const on_file_written = vi.fn();
    const write_order: string[] = [];

    notes_port.read_note = vi
      .fn()
      .mockImplementation((_vid: unknown, note_id: NoteId) => {
        if (String(note_id) === SOURCE_PATH) {
          return Promise.resolve({
            meta: SOURCE_NOTE,
            markdown: as_markdown_text("See [Old](old.md)"),
          });
        }
        return Promise.resolve({
          meta: { ...SOURCE_NOTE, id: note_id, path: as_note_path(note_id) },
          markdown: as_markdown_text("# Content"),
        });
      });

    notes_port.write_note = vi
      .fn()
      .mockImplementation((..._args: unknown[]) => {
        write_order.push("write");
        return Promise.resolve();
      });

    on_file_written.mockImplementation(() => {
      write_order.push("on_file_written");
    });

    const search_port = create_mock_search_port({
      get_note_links_snapshot: vi.fn().mockResolvedValue(BACKLINKS_SNAPSHOT),
      rewrite_note_links: rewrite_always_changed(),
    });

    const service = new LinkRepairService(
      notes_port,
      search_port,
      index_port,
      editor_store,
      tab_store,
      () => 1,
      () => {},
      on_file_written,
    );

    await service.repair_links(VAULT_ID, RENAME_MAP);

    expect(on_file_written).toHaveBeenCalledWith(SOURCE_PATH);
    expect(write_order.indexOf("on_file_written")).toBeLessThan(
      write_order.indexOf("write"),
    );
  });

  it("calls on_file_written with note path before write for open non-dirty notes", async () => {
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();
    const on_file_written = vi.fn();
    const write_order: string[] = [];

    editor_store.set_open_note({
      meta: SOURCE_NOTE,
      markdown: as_markdown_text("See [Old](old.md)"),
      buffer_id: "source-buffer",
      is_dirty: false,
    });

    notes_port.write_note = vi
      .fn()
      .mockImplementation((..._args: unknown[]) => {
        write_order.push("write");
        return Promise.resolve();
      });

    on_file_written.mockImplementation(() => {
      write_order.push("on_file_written");
    });

    const search_port = create_mock_search_port({
      get_note_links_snapshot: vi.fn().mockResolvedValue(BACKLINKS_SNAPSHOT),
      rewrite_note_links: vi
        .fn()
        .mockImplementation(
          (
            markdown: string,
            old_source: string,
            new_source: string,
            _map: Record<string, string>,
          ) => {
            if (old_source === new_source) {
              return Promise.resolve({
                markdown: "See [Old](new.md)",
                changed: true,
              });
            }
            return Promise.resolve({ markdown, changed: false });
          },
        ),
    });

    const service = new LinkRepairService(
      notes_port,
      search_port,
      index_port,
      editor_store,
      tab_store,
      () => 1,
      () => {},
      on_file_written,
    );

    await service.repair_links(VAULT_ID, RENAME_MAP);

    expect(on_file_written).toHaveBeenCalledWith(SOURCE_PATH);
    expect(write_order.indexOf("on_file_written")).toBeLessThan(
      write_order.indexOf("write"),
    );
  });

  it("does not call on_file_written when open note is dirty", async () => {
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();
    const on_file_written = vi.fn();

    editor_store.set_open_note({
      meta: SOURCE_NOTE,
      markdown: as_markdown_text("See [Old](old.md)"),
      buffer_id: "source-buffer",
      is_dirty: true,
    });

    const search_port = create_mock_search_port({
      get_note_links_snapshot: vi.fn().mockResolvedValue(BACKLINKS_SNAPSHOT),
      rewrite_note_links: vi
        .fn()
        .mockImplementation(
          (
            markdown: string,
            old_source: string,
            new_source: string,
            _map: Record<string, string>,
          ) => {
            if (old_source === new_source) {
              return Promise.resolve({
                markdown: "See [Old](new.md)",
                changed: true,
              });
            }
            return Promise.resolve({ markdown, changed: false });
          },
        ),
    });

    const service = new LinkRepairService(
      notes_port,
      search_port,
      index_port,
      editor_store,
      tab_store,
      () => 1,
      () => {},
      on_file_written,
    );

    await service.repair_links(VAULT_ID, RENAME_MAP);

    expect(on_file_written).not.toHaveBeenCalled();
    expect(notes_port._calls.write_note).toEqual([]);
  });

  it("skips when path map is empty", async () => {
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();

    const get_note_links_snapshot = vi.fn();
    const search_port = create_mock_search_port({ get_note_links_snapshot });

    const service = new LinkRepairService(
      notes_port,
      search_port,
      index_port,
      editor_store,
      tab_store,
      () => 1,
    );

    const result = await service.repair_links(VAULT_ID, new Map());

    expect(get_note_links_snapshot).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 0, rewritten: 0, failed: [] });
  });

  it("reports failures without throwing", async () => {
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const notes_port = create_mock_notes_port();
    const index_port = create_mock_index_port();

    notes_port.read_note = vi.fn().mockRejectedValue(new Error("disk failed"));

    const search_port = create_mock_search_port({
      get_note_links_snapshot: vi.fn().mockResolvedValue(BACKLINKS_SNAPSHOT),
    });

    const service = new LinkRepairService(
      notes_port,
      search_port,
      index_port,
      editor_store,
      tab_store,
      () => 1,
    );

    const result = await service.repair_links(VAULT_ID, RENAME_MAP);

    expect(result).toEqual({
      scanned: 2,
      rewritten: 0,
      failed: [SOURCE_PATH, "docs/new.md"],
    });
  });
});
