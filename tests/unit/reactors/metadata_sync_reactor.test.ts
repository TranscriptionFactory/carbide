import { describe, expect, it } from "vitest";
import { resolve_metadata_sync_decision } from "$lib/reactors/metadata_sync.reactor.svelte";

function state(
  input?: Partial<{
    last_note_path: string | null;
    last_panel_open: boolean;
    last_index_status: "idle" | "indexing" | "completed" | "failed";
    last_is_dirty: boolean;
    index_epoch: number;
    save_epoch: number;
    loaded_note_path: string | null;
    loaded_index_epoch: number;
    loaded_save_epoch: number;
  }>,
) {
  return {
    last_note_path: null,
    last_panel_open: false,
    last_index_status: "idle" as const,
    last_is_dirty: false,
    index_epoch: 0,
    save_epoch: 0,
    loaded_note_path: null,
    loaded_index_epoch: 0,
    loaded_save_epoch: 0,
    ...input,
  };
}

function input(
  value: Partial<{
    open_note_path: string | null;
    panel_open: boolean;
    index_status: "idle" | "indexing" | "completed" | "failed";
    is_dirty: boolean;
    snapshot_note_path: string | null;
    has_error: boolean;
  }>,
) {
  return {
    open_note_path: null,
    panel_open: false,
    index_status: "idle" as const,
    is_dirty: false,
    snapshot_note_path: null,
    has_error: false,
    ...value,
  };
}

describe("metadata_sync.reactor", () => {
  it("clears metadata when no note is open", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        last_index_status: "completed",
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: null,
        panel_open: true,
        index_status: "completed",
      }),
    );

    expect(result.action).toBe("clear");
    expect(result.next_state.loaded_note_path).toBeNull();
  });

  it("loads when panel opens for an already open note", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        snapshot_note_path: null,
      }),
    );

    expect(result.action).toBe("load");
    expect(result.note_path).toBe("docs/a.md");
  });

  it("loads when the active note changes while the panel is open", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: "docs/b.md",
        panel_open: true,
        snapshot_note_path: "docs/a.md",
      }),
    );

    expect(result.action).toBe("load");
    expect(result.note_path).toBe("docs/b.md");
  });

  it("loads when a save completes while the panel is open", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        last_index_status: "completed",
        last_is_dirty: true,
        loaded_note_path: "docs/a.md",
        loaded_index_epoch: 1,
        loaded_save_epoch: 0,
        index_epoch: 1,
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        index_status: "completed",
        is_dirty: false,
        snapshot_note_path: "docs/a.md",
      }),
    );

    expect(result.action).toBe("load");
    expect(result.note_path).toBe("docs/a.md");
  });

  it("does not load on save completion while the panel is closed", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
        last_index_status: "completed",
        last_is_dirty: true,
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: false,
        index_status: "completed",
        is_dirty: false,
        snapshot_note_path: "docs/a.md",
      }),
    );

    expect(result.action).toBe("noop");
  });

  it("loads when indexing completes while the panel is open", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        last_index_status: "indexing",
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        index_status: "completed",
        snapshot_note_path: "docs/a.md",
      }),
    );

    expect(result.action).toBe("load");
    expect(result.note_path).toBe("docs/a.md");
  });

  it("does not reload on panel reopen when the current snapshot is fresh", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
        last_index_status: "completed",
        loaded_note_path: "docs/a.md",
        index_epoch: 2,
        loaded_index_epoch: 2,
        save_epoch: 3,
        loaded_save_epoch: 3,
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        index_status: "completed",
        snapshot_note_path: "docs/a.md",
      }),
    );

    expect(result.action).toBe("noop");
  });

  it("retries when the panel reopens after the last load failed", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
        last_index_status: "completed",
        loaded_note_path: "docs/a.md",
        index_epoch: 1,
        loaded_index_epoch: 1,
        save_epoch: 1,
        loaded_save_epoch: 1,
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        index_status: "completed",
        snapshot_note_path: null,
        has_error: true,
      }),
    );

    expect(result.action).toBe("load");
    expect(result.note_path).toBe("docs/a.md");
  });
});
