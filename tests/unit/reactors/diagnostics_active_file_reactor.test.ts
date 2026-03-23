import { describe, expect, it, vi } from "vitest";
import { create_diagnostics_active_file_reactor } from "$lib/reactors/diagnostics_active_file.reactor.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

function make_editor_store(path: string | null) {
  return {
    open_note: path
      ? {
          meta: {
            id: as_note_path(path),
            path: as_note_path(path),
            name: path.split("/").pop()!,
            title: path.split("/").pop()!.replace(".md", ""),
            mtime_ms: 0,
            size_bytes: 0,
          },
          markdown: as_markdown_text("# Test"),
          buffer_id: path,
          is_dirty: false,
        }
      : null,
  } as never;
}

describe("diagnostics_active_file.reactor", () => {
  it("returns a cleanup function", () => {
    const diagnostics_store = { set_active_file: vi.fn() } as never;
    const unmount = create_diagnostics_active_file_reactor(
      make_editor_store("notes/a.md"),
      diagnostics_store,
    );
    expect(typeof unmount).toBe("function");
    unmount();
  });

  it("handles null open_note", () => {
    const diagnostics_store = { set_active_file: vi.fn() } as never;
    const unmount = create_diagnostics_active_file_reactor(
      make_editor_store(null),
      diagnostics_store,
    );
    expect(typeof unmount).toBe("function");
    unmount();
  });
});
