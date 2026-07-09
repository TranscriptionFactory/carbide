import { describe, expect, it } from "vitest";
import {
  resolve_editor_sync_cursor_offset,
  resolve_editor_sync_restore_policy,
  resolve_editor_sync_scroll_top,
} from "$lib/reactors/editor_sync.reactor.svelte";

describe("editor_sync.reactor cursor restore on tab switch", () => {
  it("threads a saved cursor offset when switching note identity (A->B->A)", () => {
    const policy = resolve_editor_sync_restore_policy({
      open_note_id: "a.md",
      last_note_id: "b.md",
    });
    const offset = resolve_editor_sync_cursor_offset({
      markdown_cursor_offset: 7,
      source_cursor_offset: 7,
      scroll_top: 120,
    });

    expect(policy).toBe("reuse_cache");
    expect(offset).toBe(7);
  });

  it("restores a document-start cursor at offset 0", () => {
    expect(
      resolve_editor_sync_cursor_offset({
        markdown_cursor_offset: 0,
        source_cursor_offset: 0,
        scroll_top: 0,
      }),
    ).toBe(0);
  });

  it("yields no offset when there is no pending restore", () => {
    expect(resolve_editor_sync_cursor_offset(null)).toBeUndefined();
  });

  it("ignores a negative (sentinel) markdown offset", () => {
    expect(
      resolve_editor_sync_cursor_offset({
        markdown_cursor_offset: -1,
        source_cursor_offset: 0,
        scroll_top: 0,
      }),
    ).toBeUndefined();
  });

  it("restores a saved mid-document scroll position", () => {
    expect(
      resolve_editor_sync_scroll_top({
        markdown_cursor_offset: 7,
        source_cursor_offset: 7,
        scroll_top: 120,
      }),
    ).toBe(120);
  });

  it("restores an exact top-of-document scroll position", () => {
    expect(
      resolve_editor_sync_scroll_top({
        markdown_cursor_offset: 0,
        source_cursor_offset: 0,
        scroll_top: 0,
      }),
    ).toBe(0);
  });

  it("yields no scroll position when there is no pending restore", () => {
    expect(resolve_editor_sync_scroll_top(null)).toBeUndefined();
  });
});
