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
      list_all_tags: vi.fn().mockResolvedValue([]),
      get_notes_for_tag: vi.fn().mockResolvedValue([]),
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

  it("translates symbolic property operators to bases operators", async () => {
    const bases = { query: vi.fn().mockResolvedValue({ rows: [], total: 0 }) };
    const cases: Array<[string, string]> = [
      ["=", "eq"],
      ["!=", "neq"],
      [">", "gt"],
      ["<", "lt"],
      [">=", "gte"],
      ["<=", "lte"],
      ["contains", "contains"],
    ];
    for (const [symbolic, expected] of cases) {
      const query: ParsedQuery = {
        form: "notes",
        root: {
          kind: "clause",
          type: "with_property",
          negated: false,
          value: { kind: "text", value: "now()-1d" },
          property_name: "created",
          property_operator: symbolic,
        },
      };
      await solve_query(
        VAULT_ID,
        query,
        make_backends({ bases: bases as never }),
      );
      expect(bases.query).toHaveBeenLastCalledWith(VAULT_ID, {
        filters: [
          { property: "created", operator: expected, value: "now()-1d" },
        ],
        sort: [],
        limit: 200,
        offset: 0,
      });
    }
  });

  describe("sections form", () => {
    function note_meta(path: string) {
      return {
        id: path,
        path,
        name: "note.md",
        title: "Note",
        blurb: "",
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 0,
        file_type: null,
      };
    }

    function section_hit(
      path: string,
      heading_path: string,
      start_line: number,
    ) {
      const segments = heading_path.split("/");
      return {
        note: note_meta(path),
        heading_id: `h-${String(start_line)}`,
        title: segments[segments.length - 1] ?? heading_path,
        level: segments.length,
        heading_path,
        start_line,
        end_line: start_line + 2,
        word_count: 5,
      };
    }

    it("maps named to a title filter and returns section rows", async () => {
      const search = {
        query_sections: vi
          .fn()
          .mockResolvedValue([section_hit("notes/a.md", "Meeting/Q4", 4)]),
      };
      const query: ParsedQuery = {
        form: "sections",
        root: {
          kind: "clause",
          type: "named",
          negated: false,
          value: { kind: "text", value: "Q4" },
        },
      };

      const result = await solve_query(
        VAULT_ID,
        query,
        make_backends({ search: search as never }),
      );

      expect(search.query_sections).toHaveBeenCalledWith(VAULT_ID, {
        limit: 200,
        title: "Q4",
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.section).toEqual({
        heading_id: "h-4",
        title: "Q4",
        level: 2,
        heading_path: "Meeting/Q4",
        start_line: 4,
        end_line: 6,
        word_count: 5,
      });
      expect(result.items[0]?.matched_clauses).toEqual(['named:"Q4"']);
    });

    it("maps a regex named value to a regex title filter", async () => {
      const search = { query_sections: vi.fn().mockResolvedValue([]) };
      const query: ParsedQuery = {
        form: "sections",
        root: {
          kind: "clause",
          type: "named",
          negated: false,
          value: { kind: "regex", pattern: "Meet.ng", flags: "i" },
        },
      };

      await solve_query(
        VAULT_ID,
        query,
        make_backends({ search: search as never }),
      );

      expect(search.query_sections).toHaveBeenCalledWith(VAULT_ID, {
        limit: 200,
        title: "Meet.ng",
        title_is_regex: true,
      });
    });

    it("maps in to a folder path prefix", async () => {
      const search = { query_sections: vi.fn().mockResolvedValue([]) };
      const query: ParsedQuery = {
        form: "sections",
        root: {
          kind: "clause",
          type: "in",
          negated: false,
          value: { kind: "text", value: "Projects" },
        },
      };

      await solve_query(
        VAULT_ID,
        query,
        make_backends({ search: search as never }),
      );

      expect(search.query_sections).toHaveBeenCalledWith(VAULT_ID, {
        limit: 200,
        path_prefix: "Projects/",
      });
    });

    it("maps under to a heading path filter", async () => {
      const search = { query_sections: vi.fn().mockResolvedValue([]) };
      const query: ParsedQuery = {
        form: "sections",
        root: {
          kind: "clause",
          type: "under",
          negated: false,
          value: { kind: "text", value: "Roadmap/Q4" },
        },
      };

      await solve_query(
        VAULT_ID,
        query,
        make_backends({ search: search as never }),
      );

      expect(search.query_sections).toHaveBeenCalledWith(VAULT_ID, {
        limit: 200,
        heading_path_under: "Roadmap/Q4",
      });
    });

    it("keeps a section row when a note-level clause matches its note", async () => {
      const search = {
        query_sections: vi
          .fn()
          .mockResolvedValue([
            section_hit("notes/a.md", "Meeting", 0),
            section_hit("notes/b.md", "Meeting", 0),
          ]),
      };
      const bases = {
        query: vi.fn().mockResolvedValue({
          rows: [{ note: note_meta("notes/a.md") }],
          total: 1,
        }),
      };
      const query: ParsedQuery = {
        form: "sections",
        root: {
          kind: "group",
          join: "and",
          clauses: [
            {
              kind: "clause",
              type: "named",
              negated: false,
              value: { kind: "text", value: "Meeting" },
            },
            {
              kind: "clause",
              type: "with_property",
              negated: false,
              value: { kind: "text", value: "Smith" },
              property_name: "author",
              property_operator: "=",
            },
          ],
        },
      };

      const result = await solve_query(
        VAULT_ID,
        query,
        make_backends({ search: search as never, bases: bases as never }),
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.note.path).toBe("notes/a.md");
      expect(result.items[0]?.section?.heading_path).toBe("Meeting");
    });

    it("keeps two sections of one note apart through an OR", async () => {
      const search = {
        query_sections: vi.fn(
          (
            _vault: unknown,
            filter: { path_prefix?: string; heading_path_under?: string },
          ) =>
            Promise.resolve(
              filter.path_prefix
                ? [section_hit("notes/a.md", "Meeting", 0)]
                : [section_hit("notes/a.md", "Meeting/Q4", 4)],
            ),
        ),
      };
      const query: ParsedQuery = {
        form: "sections",
        root: {
          kind: "group",
          join: "or",
          clauses: [
            {
              kind: "clause",
              type: "in",
              negated: false,
              value: { kind: "text", value: "Projects" },
            },
            {
              kind: "clause",
              type: "under",
              negated: false,
              value: { kind: "text", value: "Meeting/Q4" },
            },
          ],
        },
      };

      const result = await solve_query(
        VAULT_ID,
        query,
        make_backends({ search: search as never }),
      );

      const headings = result.items.map((item) => item.section?.heading_path);
      expect(headings).toEqual(["Meeting", "Meeting/Q4"]);
    });
  });
});
