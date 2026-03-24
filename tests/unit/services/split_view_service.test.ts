import { describe, expect, it, vi } from "vitest";
import { SplitViewService } from "$lib/features/split_view";
import { SplitViewStore } from "$lib/features/split_view";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { EditorPort, EditorServiceCallbacks } from "$lib/features/editor";
import { create_test_vault } from "../helpers/test_fixtures";

function create_mock_editor_port(): EditorPort {
  return {
    create_editor: vi.fn(),
    destroy_editor: vi.fn(),
  } as unknown as EditorPort;
}

function create_mock_callbacks(): EditorServiceCallbacks {
  return {
    on_update: vi.fn(),
    on_focus: vi.fn(),
  } as unknown as EditorServiceCallbacks;
}

function create_service(): {
  service: SplitViewService;
  secondary_store: EditorStore;
  split_view_store: SplitViewStore;
} {
  const editor_port = create_mock_editor_port();
  const vault_store = new VaultStore();
  const op_store = new OpStore();
  const split_view_store = new SplitViewStore();
  const callbacks = create_mock_callbacks();

  vault_store.set_vault(create_test_vault());

  const service = new SplitViewService(
    editor_port,
    vault_store,
    op_store,
    split_view_store,
    callbacks,
  );

  const secondary_store = new EditorStore();
  (service as unknown as { secondary_store: EditorStore }).secondary_store =
    secondary_store;

  return { service, secondary_store, split_view_store };
}

function make_open_note(id: string) {
  const note_id = as_note_path(id);
  return {
    meta: {
      id: note_id,
      path: note_id,
      name: id,
      title: id,
      mtime_ms: 1000,
      size_bytes: 0,
      file_type: null,
    },
    markdown: as_markdown_text("content"),
    buffer_id: note_id,
    is_dirty: false,
  };
}

describe("SplitViewService.is_same_note_in_both_panes", () => {
  it("returns true when secondary has same note id", () => {
    const { service, secondary_store } = create_service();
    const note = make_open_note("notes/alpha.md");
    secondary_store.set_open_note(note);

    expect(service.is_same_note_in_both_panes(note.meta.id)).toBe(true);
  });

  it("returns false when secondary has a different note", () => {
    const { service, secondary_store } = create_service();
    const alpha = make_open_note("notes/alpha.md");
    const beta = make_open_note("notes/beta.md");
    secondary_store.set_open_note(beta);

    expect(service.is_same_note_in_both_panes(alpha.meta.id)).toBe(false);
  });

  it("returns false when primary_note_id is null", () => {
    const { service, secondary_store } = create_service();
    const note = make_open_note("notes/alpha.md");
    secondary_store.set_open_note(note);

    expect(service.is_same_note_in_both_panes(null)).toBe(false);
  });

  it("returns false when no secondary note is open", () => {
    const { service } = create_service();

    expect(
      service.is_same_note_in_both_panes(as_note_path("notes/alpha.md")),
    ).toBe(false);
  });
});

describe("SplitViewService.propagate_mtime_to_secondary", () => {
  it("updates mtime on secondary store when note matches", () => {
    const { service, secondary_store } = create_service();
    const note = make_open_note("notes/alpha.md");
    secondary_store.set_open_note(note);

    service.propagate_mtime_to_secondary(note.meta.id, 5000);

    expect(secondary_store.open_note?.meta.mtime_ms).toBe(5000);
  });

  it("does not update when secondary has a different note", () => {
    const { service, secondary_store } = create_service();
    const alpha = make_open_note("notes/alpha.md");
    const beta = make_open_note("notes/beta.md");
    secondary_store.set_open_note(beta);

    service.propagate_mtime_to_secondary(alpha.meta.id, 5000);

    expect(secondary_store.open_note?.meta.mtime_ms).toBe(1000);
  });

  it("does nothing when secondary_store is null", () => {
    const { service } = create_service();
    (service as unknown as { secondary_store: null }).secondary_store = null;

    expect(() => {
      service.propagate_mtime_to_secondary(
        as_note_path("notes/alpha.md"),
        5000,
      );
    }).not.toThrow();
  });
});
