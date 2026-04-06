import { describe, expect, it, vi } from "vitest";
import { solve_query } from "$lib/features/query/domain/query_solver";
import type { QueryBackends } from "$lib/features/query/domain/query_solver";
import type { ParsedQuery } from "$lib/features/query/types";
import type { VaultId } from "$lib/shared/types/ids";

function make_backends(overrides?: Partial<QueryBackends>): QueryBackends {
  return {
    search: {
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi
        .fn()
        .mockResolvedValue({ backlinks: [], outlinks: [], orphan_links: [] }),
    } as never,
    index: {
      list_note_paths_by_prefix: vi.fn().mockResolvedValue([]),
    } as never,
    tags: {
      get_notes_for_tag_prefix: vi.fn().mockResolvedValue([]),
    } as never,
    bases: {
      query: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    } as never,
    ...overrides,
  };
}

const VAULT_ID = "test-vault" as VaultId;

describe("query_solver", () => {
  it("returns empty results for empty clause group", async () => {
    const query: ParsedQuery = {
      form: "notes",
      root: { kind: "group", join: "and", clauses: [] },
    };
    const result = await solve_query(VAULT_ID, query, make_backends());
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("dispatches with tag to tags port", async () => {
    const tags = {
      get_notes_for_tag_prefix: vi
        .fn()
        .mockResolvedValue(["notes/a.md", "notes/b.md"]),
    };
    const query: ParsedQuery = {
      form: "notes",
      root: {
        kind: "clause",
        type: "with",
        negated: false,
        value: { kind: "tag", tag: "project" },
      },
    };
    const result = await solve_query(
      VAULT_ID,
      query,
      make_backends({ tags: tags as never }),
    );
    expect(tags.get_notes_for_tag_prefix).toHaveBeenCalledWith(
      VAULT_ID,
      "project",
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.note.path).toBe("notes/a.md");
  });

  it("dispatches with text to search port", async () => {
    const search = {
      search_notes: vi.fn().mockResolvedValue([
        {
          note: {
            id: "a.md",
            path: "a.md",
            name: "a.md",
            title: "a",
            mtime_ms: 0,
            ctime_ms: 0,
            size_bytes: 0,
            file_type: null,
          },
          score: 1,
        },
      ]),
      get_note_links_snapshot: vi.fn(),
    };
    const query: ParsedQuery = {
      form: "notes",
      root: {
        kind: "clause",
        type: "with",
        negated: false,
        value: { kind: "text", value: "hello" },
      },
    };
    const result = await solve_query(
      VAULT_ID,
      query,
      make_backends({ search: search as never }),
    );
    expect(search.search_notes).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
  });

  it("dispatches in clause to index port", async () => {
    const index = {
      list_note_paths_by_prefix: vi
        .fn()
        .mockResolvedValue(["Projects/a.md", "Projects/b.md"]),
    };
    const query: ParsedQuery = {
      form: "notes",
      root: {
        kind: "clause",
        type: "in",
        negated: false,
        value: { kind: "wikilink", target: "Projects" },
      },
    };
    const result = await solve_query(
      VAULT_ID,
      query,
      make_backends({ index: index as never }),
    );
    expect(index.list_note_paths_by_prefix).toHaveBeenCalledWith(
      VAULT_ID,
      "Projects/",
    );
    expect(result.items).toHaveLength(2);
  });

  it("dispatches linked_from to search port backlinks", async () => {
    const search = {
      search_notes: vi.fn(),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [
          {
            id: "target.md",
            path: "target.md",
            name: "target.md",
            title: "target",
            mtime_ms: 0,
            ctime_ms: 0,
            size_bytes: 0,
            file_type: null,
          },
        ],
        orphan_links: [],
      }),
    };
    const query: ParsedQuery = {
      form: "notes",
      root: {
        kind: "clause",
        type: "linked_from",
        negated: false,
        value: { kind: "wikilink", target: "Index" },
      },
    };
    const result = await solve_query(
      VAULT_ID,
      query,
      make_backends({ search: search as never }),
    );
    expect(search.get_note_links_snapshot).toHaveBeenCalledWith(
      VAULT_ID,
      "Index.md",
    );
    expect(result.items).toHaveLength(1);
  });

  it("composes AND clauses by intersection", async () => {
    const tags = {
      get_notes_for_tag_prefix: vi
        .fn()
        .mockResolvedValue(["a.md", "b.md", "c.md"]),
    };
    const index = {
      list_note_paths_by_prefix: vi.fn().mockResolvedValue(["b.md", "c.md"]),
    };
    const query: ParsedQuery = {
      form: "notes",
      root: {
        kind: "group",
        join: "and",
        clauses: [
          {
            kind: "clause",
            type: "with",
            negated: false,
            value: { kind: "tag", tag: "project" },
          },
          {
            kind: "clause",
            type: "in",
            negated: false,
            value: { kind: "wikilink", target: "Archive" },
          },
        ],
      },
    };
    const result = await solve_query(
      VAULT_ID,
      query,
      make_backends({ tags: tags as never, index: index as never }),
    );
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.note.path)).toEqual(["b.md", "c.md"]);
  });

  it("composes OR clauses by union", async () => {
    const tags = {
      get_notes_for_tag_prefix: vi.fn().mockResolvedValue(["a.md"]),
    };
    const index = {
      list_note_paths_by_prefix: vi.fn().mockResolvedValue(["b.md"]),
    };
    const query: ParsedQuery = {
      form: "notes",
      root: {
        kind: "group",
        join: "or",
        clauses: [
          {
            kind: "clause",
            type: "with",
            negated: false,
            value: { kind: "tag", tag: "project" },
          },
          {
            kind: "clause",
            type: "in",
            negated: false,
            value: { kind: "wikilink", target: "Archive" },
          },
        ],
      },
    };
    const result = await solve_query(
      VAULT_ID,
      query,
      make_backends({ tags: tags as never, index: index as never }),
    );
    expect(result.items).toHaveLength(2);
  });

  it("tracks elapsed_ms", async () => {
    const query: ParsedQuery = {
      form: "notes",
      root: {
        kind: "clause",
        type: "with",
        negated: false,
        value: { kind: "tag", tag: "test" },
      },
    };
    const result = await solve_query(VAULT_ID, query, make_backends());
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
  });
});
