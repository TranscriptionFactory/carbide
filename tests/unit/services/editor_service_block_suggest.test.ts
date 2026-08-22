import { describe, expect, it, vi } from "vitest";
import type {
  EditorPort,
  EditorSession,
  EditorSessionConfig,
} from "$lib/features/editor/ports";
import {
  collect_addressable_blocks,
  EditorService,
  mint_block_in_markdown,
  type EditorServiceCallbacks,
} from "$lib/features/editor/application/editor_service";
import type { BlockSuggestion } from "$lib/features/editor/ports";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { TabStore } from "$lib/features/tab";
import type { NotesPort } from "$lib/features/note";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import {
  create_open_note_state,
  create_test_note,
  create_test_vault,
} from "../helpers/test_fixtures";

function session(markdown: string): EditorSession {
  let current = markdown;
  return {
    destroy: vi.fn(),
    set_markdown: vi.fn((value: string) => {
      current = value;
    }),
    replace_doc_undoable: vi.fn((value: string) => {
      current = value;
    }),
    get_markdown: vi.fn(() => current),
    insert_text_at_cursor: vi.fn(),
    mark_clean: vi.fn(),
    is_dirty: vi.fn(() => false),
    focus: vi.fn(),
    open_buffer: vi.fn(),
    rename_buffer: vi.fn(),
    close_buffer: vi.fn(),
    set_block_suggestions: vi.fn(),
  };
}

function setup(target_markdown: string) {
  const source = create_open_note_state(create_test_note("source", "Source"));
  const target = create_open_note_state(
    create_test_note("target", "Target"),
    target_markdown,
  );
  target.meta.mtime_ms = 41;
  const editor_store = new EditorStore();
  editor_store.set_open_note(source);
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());
  const tab_store = new TabStore();
  const editor_session = session(source.markdown);
  let config: EditorSessionConfig | null = null;
  const editor_port: EditorPort = {
    start_session: vi.fn((value: EditorSessionConfig) => {
      config = value;
      return Promise.resolve(editor_session);
    }),
  };
  const notes_port = {
    read_note: vi.fn(() =>
      Promise.resolve({
        meta: target.meta,
        markdown: as_markdown_text(target_markdown),
      }),
    ),
    write_note: vi.fn(() => Promise.resolve(52)),
  } as unknown as NotesPort;
  const search_service = {
    resolve_wiki_link: vi.fn(() => Promise.resolve("target.md")),
  };
  const callbacks: EditorServiceCallbacks = {
    on_internal_link_click: vi.fn(),
    on_external_link_click: vi.fn(),
    on_image_paste_requested: vi.fn(),
    on_file_drop_requested: vi.fn(),
    read_note_markdown: (path) => {
      const tab = tab_store.find_tab_by_path(path);
      return Promise.resolve(
        (tab ? tab_store.get_cached_note(tab.id)?.markdown : null) ??
          as_markdown_text(target_markdown),
      );
    },
    commit_note_markdown: async (path, expected, updated) => {
      const tab = tab_store.find_tab_by_path(path);
      const cached = tab ? tab_store.get_cached_note(tab.id) : null;
      if (cached) {
        if (cached.markdown !== expected) return false;
        tab_store.set_cached_note(tab!.id, {
          ...cached,
          markdown: updated,
          is_dirty: cached.is_dirty,
        });
        if (cached.is_dirty) return true;
      }
      await notes_port.write_note(
        vault_store.active_vault_id!,
        path,
        updated,
        cached?.meta.mtime_ms ?? target.meta.mtime_ms,
      );
      return true;
    },
  };
  const service = new EditorService(
    editor_port,
    vault_store,
    editor_store,
    new OpStore(),
    callbacks,
    search_service as never,
    undefined,
    undefined,
    undefined,
    undefined,
    notes_port,
    undefined,
  );

  return {
    service,
    source,
    target,
    tab_store,
    notes_port,
    editor_session,
    get_config: () => {
      if (!config) throw new Error("editor session was not mounted");
      return config;
    },
  };
}

function unminted(): BlockSuggestion {
  return {
    block_id: null,
    text: "target claim",
    end_line: 1,
    end_offset: 12,
    note_path: "target.md",
  };
}

function require_id(value: string | null | undefined): string {
  if (!value) throw new Error("block id was not minted");
  return value;
}

describe("block suggestions", () => {
  it("lists addressable blocks with existing-or-null ids", () => {
    expect(
      collect_addressable_blocks(
        "# Heading\ntarget claim\n- list item ^kept01\n```\ncode\n```",
        "target.md",
      ),
    ).toEqual([
      {
        block_id: null,
        text: "target claim",
        end_line: 2,
        end_offset: 22,
        note_path: "target.md",
      },
      {
        block_id: "kept01",
        text: "list item",
        end_line: 3,
        end_offset: 42,
        note_path: "target.md",
      },
    ]);
  });

  it("refuses to mint when the selected line changed after querying", () => {
    expect(
      mint_block_in_markdown("different text", unminted(), "abc123"),
    ).toBeNull();
  });

  it("returns unminted blocks from the target note", async () => {
    const harness = setup("target claim\n\nsecond block");
    await harness.service.mount({
      root: {} as HTMLDivElement,
      note: harness.source,
    });

    harness.get_config().events.on_wiki_suggest_query?.({
      kind: "block",
      note_name: "target",
      block_query: "claim",
    });
    await vi.waitUntil(
      () =>
        vi.mocked(harness.editor_session.set_block_suggestions ?? vi.fn()).mock
          .calls.length > 0,
    );

    expect(harness.editor_session.set_block_suggestions).toHaveBeenCalledWith([
      unminted(),
    ]);
  });

  it("mints an unopened target on disk with an mtime guard", async () => {
    const harness = setup("target claim");
    await harness.service.mount({
      root: {} as HTMLDivElement,
      note: harness.source,
    });

    const block_id = require_id(
      await harness.get_config().events.on_block_suggest_accept?.(unminted()),
    );

    expect(block_id).toMatch(/^[a-z0-9]{6}$/);
    expect(harness.notes_port.write_note).toHaveBeenCalledWith(
      expect.any(String),
      as_note_path("target.md"),
      as_markdown_text(`target claim ^${block_id}`),
      41,
    );
  });

  it("reuses a pre-minted id without writing", async () => {
    const harness = setup("target claim ^kept01");
    await harness.service.mount({
      root: {} as HTMLDivElement,
      note: harness.source,
    });

    const block_id = await harness
      .get_config()
      .events.on_block_suggest_accept?.({
        ...unminted(),
        block_id: "kept01",
        end_offset: 20,
      });

    expect(block_id).toBe("kept01");
    expect(harness.notes_port.write_note).not.toHaveBeenCalled();
  });

  it("updates a clean open target cache and disk", async () => {
    const harness = setup("target claim");
    const tab = harness.tab_store.open_tab(as_note_path("target.md"), "Target");
    harness.tab_store.set_cached_note(tab.id, harness.target);
    await harness.service.mount({
      root: {} as HTMLDivElement,
      note: harness.source,
    });

    const block_id = require_id(
      await harness.get_config().events.on_block_suggest_accept?.(unminted()),
    );

    expect(harness.tab_store.get_cached_note(tab.id)?.markdown).toBe(
      `target claim ^${block_id}`,
    );
    expect(harness.notes_port.write_note).toHaveBeenCalledOnce();
  });

  it("mints into a dirty open target cache without clobbering or disk write", async () => {
    const harness = setup("saved claim");
    const tab = harness.tab_store.open_tab(as_note_path("target.md"), "Target");
    harness.tab_store.set_cached_note(tab.id, {
      ...harness.target,
      markdown: as_markdown_text("target claim\n\nunsaved edit"),
      is_dirty: true,
    });
    harness.tab_store.set_dirty(tab.id, true);
    await harness.service.mount({
      root: {} as HTMLDivElement,
      note: harness.source,
    });

    const block_id = require_id(
      await harness.get_config().events.on_block_suggest_accept?.(unminted()),
    );

    expect(harness.tab_store.get_cached_note(tab.id)?.markdown).toBe(
      `target claim ^${block_id}\n\nunsaved edit`,
    );
    expect(harness.tab_store.get_cached_note(tab.id)?.is_dirty).toBe(true);
    expect(harness.notes_port.write_note).not.toHaveBeenCalled();
  });
});
