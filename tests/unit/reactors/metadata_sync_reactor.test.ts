import { describe, expect, it } from "vitest";
import { resolve_metadata_sync_decision } from "$lib/reactors/metadata_sync.reactor.svelte";

function state(
  input?: Partial<{
    last_note_path: string | null;
    last_panel_open: boolean;
    last_markdown: string | null;
    loaded_note_path: string | null;
  }>,
) {
  return {
    last_note_path: null,
    last_panel_open: false,
    last_markdown: null,
    loaded_note_path: null,
    ...input,
  };
}

function input(
  value: Partial<{
    open_note_path: string | null;
    panel_open: boolean;
    markdown: string | null;
    snapshot_note_path: string | null;
    has_error: boolean;
  }>,
) {
  return {
    open_note_path: null,
    panel_open: false,
    markdown: null,
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
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: null,
        panel_open: true,
      }),
    );

    expect(result.action).toBe("clear");
    expect(result.next_state.loaded_note_path).toBeNull();
  });

  it("clears metadata when markdown is null", () => {
    const result = resolve_metadata_sync_decision(
      state(),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        markdown: null,
      }),
    );

    expect(result.action).toBe("clear");
  });

  it("loads immediately when panel opens for an already open note", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
        last_markdown: "# Hello",
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        markdown: "# Hello",
        snapshot_note_path: null,
      }),
    );

    expect(result.action).toBe("load_now");
    expect(result.note_path).toBe("docs/a.md");
  });

  it("loads immediately when the active note changes while panel is open", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        loaded_note_path: "docs/a.md",
        last_markdown: "# A",
      }),
      input({
        open_note_path: "docs/b.md",
        panel_open: true,
        markdown: "# B",
        snapshot_note_path: "docs/a.md",
      }),
    );

    expect(result.action).toBe("load_now");
    expect(result.note_path).toBe("docs/b.md");
  });

  it("debounces when markdown changes while panel is open", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: true,
        last_markdown: "# Hello",
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        markdown: "# Hello World",
        snapshot_note_path: "docs/a.md",
      }),
    );

    expect(result.action).toBe("load_debounced");
    expect(result.note_path).toBe("docs/a.md");
  });

  it("does not load when panel is closed", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
        last_markdown: "# Hello",
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: false,
        markdown: "# Hello World",
        snapshot_note_path: "docs/a.md",
      }),
    );

    expect(result.action).toBe("noop");
  });

  it("does not reload on panel reopen when snapshot is fresh", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
        last_markdown: "# Hello",
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        markdown: "# Hello",
        snapshot_note_path: "docs/a.md",
      }),
    );

    expect(result.action).toBe("noop");
  });

  it("retries when panel reopens after the last load failed", () => {
    const result = resolve_metadata_sync_decision(
      state({
        last_note_path: "docs/a.md",
        last_panel_open: false,
        last_markdown: "# Hello",
        loaded_note_path: "docs/a.md",
      }),
      input({
        open_note_path: "docs/a.md",
        panel_open: true,
        markdown: "# Hello",
        snapshot_note_path: null,
        has_error: true,
      }),
    );

    expect(result.action).toBe("load_now");
    expect(result.note_path).toBe("docs/a.md");
  });
});
