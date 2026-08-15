import { describe, expect, it } from "vitest";
import { resolve_agent_note_sync } from "$lib/features/assistant/domain/agent_note_sync";

describe("resolve_agent_note_sync", () => {
  it("reloads a clean open note the agent edited", () => {
    expect(
      resolve_agent_note_sync(
        "notes/a.md",
        {
          path: "notes/a.md",
          is_dirty: false,
          matches_disk: false,
        },
        null,
      ),
    ).toBe("reload");
  });

  it("surfaces a conflict instead of clobbering a dirty open note", () => {
    expect(
      resolve_agent_note_sync(
        "notes/a.md",
        {
          path: "notes/a.md",
          is_dirty: true,
          matches_disk: false,
        },
        null,
      ),
    ).toBe("mark_conflict");
  });

  it("matches the open note case-insensitively", () => {
    expect(
      resolve_agent_note_sync(
        "Notes/A.md",
        {
          path: "notes/a.md",
          is_dirty: false,
          matches_disk: false,
        },
        null,
      ),
    ).toBe("reload");
  });

  it("invalidates the cache of a clean background tab", () => {
    expect(
      resolve_agent_note_sync(
        "notes/b.md",
        {
          path: "notes/a.md",
          is_dirty: false,
          matches_disk: false,
        },
        { is_dirty: false },
      ),
    ).toBe("invalidate_tab_cache");
  });

  it("marks a dirty background tab conflicted", () => {
    expect(
      resolve_agent_note_sync("notes/b.md", null, { is_dirty: true }),
    ).toBe("mark_conflict");
  });

  it("ignores a path that is not open anywhere", () => {
    expect(
      resolve_agent_note_sync(
        "notes/c.md",
        {
          path: "notes/a.md",
          is_dirty: false,
          matches_disk: false,
        },
        null,
      ),
    ).toBe("ignore");
  });

  // The inline AI accept: the buffer is dirty by the editor's bookkeeping, but
  // the write that just landed is the buffer's own text. Neither a conflict
  // nor a reload — the note is simply saved.
  it("marks a dirty open note saved when disk already holds its text", () => {
    expect(
      resolve_agent_note_sync(
        "notes/a.md",
        { path: "notes/a.md", is_dirty: true, matches_disk: true },
        null,
      ),
    ).toBe("mark_saved");
  });

  it("ignores a clean open note that disk already agrees with", () => {
    expect(
      resolve_agent_note_sync(
        "notes/a.md",
        { path: "notes/a.md", is_dirty: false, matches_disk: true },
        null,
      ),
    ).toBe("ignore");
  });
});
