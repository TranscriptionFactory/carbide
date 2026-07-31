import { describe, expect, it } from "vitest";
import { resolve_agent_note_sync } from "$lib/features/rag/domain/agent_note_sync";

describe("resolve_agent_note_sync", () => {
  it("reloads a clean open note the agent edited", () => {
    expect(
      resolve_agent_note_sync(
        "notes/a.md",
        { path: "notes/a.md", is_dirty: false },
        null,
      ),
    ).toBe("reload");
  });

  it("surfaces a conflict instead of clobbering a dirty open note", () => {
    expect(
      resolve_agent_note_sync(
        "notes/a.md",
        { path: "notes/a.md", is_dirty: true },
        null,
      ),
    ).toBe("mark_conflict");
  });

  it("matches the open note case-insensitively", () => {
    expect(
      resolve_agent_note_sync(
        "Notes/A.md",
        { path: "notes/a.md", is_dirty: false },
        null,
      ),
    ).toBe("reload");
  });

  it("invalidates the cache of a clean background tab", () => {
    expect(
      resolve_agent_note_sync(
        "notes/b.md",
        { path: "notes/a.md", is_dirty: false },
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
        { path: "notes/a.md", is_dirty: false },
        null,
      ),
    ).toBe("ignore");
  });
});
