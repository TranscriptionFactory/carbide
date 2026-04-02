import { describe, expect, it } from "vitest";
import { resolve_backlinks_sync_decision } from "$lib/reactors/backlinks_sync.reactor.svelte";

function state(
  input?: Partial<{
    last_note_path: string | null;
    last_panel_open: boolean;
    last_markdown_lsp_status: string;
    last_is_dirty: boolean;
    loaded_note_path: string | null;
  }>,
) {
  return {
    last_note_path: null,
    last_panel_open: false,
    last_markdown_lsp_status: "idle",
    last_is_dirty: false,
    loaded_note_path: null,
    ...input,
  };
}

function input(
  value: Partial<{
    open_note_path: string | null;
    panel_open: boolean;
    markdown_lsp_status: string;
    is_dirty: boolean;
    snapshot_note_path: string | null;
    global_status: "idle" | "loading" | "ready" | "error";
  }>,
) {
  return {
    open_note_path: null,
    panel_open: false,
    markdown_lsp_status: "running",
    is_dirty: false,
    snapshot_note_path: null,
    global_status: "idle" as const,
    ...value,
  };
}

describe("backlinks_sync.reactor", () => {
  it("clears links when no note is open", () => {
    const result = resolve_backlinks_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
      }),
      input({
        open_note_path: null,
        panel_open: true,
      }),
    );

    expect(result.action).toBe("clear");
    expect(result.next_state.last_note_path).toBeNull();
  });

  it("loads when panel is opened for an already open note", () => {
    const result = resolve_backlinks_sync_decision(
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

  it("loads when active note path changes while panel is open", () => {
    const result = resolve_backlinks_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: "docs/b.md",
        panel_open: true,
        snapshot_note_path: "docs/a.md",
        global_status: "ready",
      }),
    );

    expect(result.action).toBe("load");
    expect(result.note_path).toBe("docs/b.md");
  });

  it("loads when Marksman transitions to running while panel is open and stale", () => {
    const result = resolve_backlinks_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        last_markdown_lsp_status: "starting",
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        markdown_lsp_status: "running",
        snapshot_note_path: null,
        global_status: "idle",
      }),
    );

    expect(result.action).toBe("load");
    expect(result.note_path).toBe("docs/a.md");
  });

  it("does nothing when panel is closed", () => {
    const result = resolve_backlinks_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: false,
        snapshot_note_path: "docs/a.md",
        global_status: "ready",
      }),
    );

    expect(result.action).toBe("noop");
  });

  it("loads when save completes while panel is open and stale", () => {
    const result = resolve_backlinks_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        last_is_dirty: true,
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        is_dirty: false,
        snapshot_note_path: null,
        global_status: "idle",
      }),
    );

    expect(result.action).toBe("load");
    expect(result.note_path).toBe("docs/a.md");
  });

  it("does not load on save when panel is closed", () => {
    const result = resolve_backlinks_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
        last_is_dirty: true,
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: false,
        is_dirty: false,
        snapshot_note_path: "docs/a.md",
        global_status: "ready",
      }),
    );

    expect(result.action).toBe("noop");
  });

  it("does not reload on panel reopen when snapshot is fresh", () => {
    const result = resolve_backlinks_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        snapshot_note_path: "docs/a.md",
        global_status: "ready",
      }),
    );

    expect(result.action).toBe("noop");
  });
});
