import { describe, expect, it, vi } from "vitest";
import {
  build_query_text,
  type PropertyOperator,
  type QueryBuilderSpec,
} from "$lib/features/query/domain/query_builder";
import { parse_query } from "$lib/features/query/domain/query_parser";
import {
  solve_query,
  type QueryBackends,
} from "$lib/features/query/domain/query_solver";
import type { VaultId } from "$lib/shared/types/ids";

const VAULT_ID = "test-vault" as VaultId;

const BASES_OPERATOR: Record<PropertyOperator, string> = {
  "=": "eq",
  "!=": "neq",
  ">": "gt",
  "<": "lt",
  ">=": "gte",
  "<=": "lte",
  contains: "contains",
};

const ALL_OPERATORS = Object.keys(BASES_OPERATOR) as PropertyOperator[];

function make_backends(bases_query: ReturnType<typeof vi.fn>): QueryBackends {
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
    bases: { query: bases_query } as never,
  };
}

function property_query_text(
  operator: PropertyOperator,
  value: string,
): string {
  const spec: QueryBuilderSpec = {
    form: "notes",
    clauses: [
      { clause: { kind: "property", property: "due", operator, value } },
    ],
  };
  return build_query_text(spec);
}

describe("builder text crosses the parser into the solver", () => {
  it.each(ALL_OPERATORS)(
    "keeps the %s operator and its value intact end to end",
    async (operator) => {
      const text = property_query_text(operator, "now()-7d");
      const parsed = parse_query(text);

      expect(parsed.ok, `failed to parse: ${text}`).toBe(true);
      if (!parsed.ok) return;

      expect(parsed.query.root).toMatchObject({
        kind: "clause",
        type: "with_property",
        property_name: "due",
        property_operator: operator,
        value: { kind: "text", value: "now()-7d" },
      });

      const bases_query = vi.fn().mockResolvedValue({ rows: [], total: 0 });
      await solve_query(VAULT_ID, parsed.query, make_backends(bases_query));

      expect(bases_query).toHaveBeenCalledWith(VAULT_ID, {
        filters: [
          {
            property: "due",
            operator: BASES_OPERATOR[operator],
            value: "now()-7d",
          },
        ],
        sort: [],
        limit: 200,
        offset: 0,
      });
    },
  );

  it("does not leak the second character of a two-character operator into the value", () => {
    const parsed = parse_query('notes with due >= "now()-7d"');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query.root).toMatchObject({
      property_operator: ">=",
      value: { kind: "text", value: "now()-7d" },
    });
  });

  it("solves an omitted form exactly like an explicit notes form", async () => {
    const bare = parse_query('with due <= "now()"');
    const explicit = parse_query('notes with due <= "now()"');

    expect(bare.ok && explicit.ok).toBe(true);
    if (!bare.ok || !explicit.ok) return;
    expect(bare.query).toEqual(explicit.query);

    const bare_bases = vi.fn().mockResolvedValue({ rows: [], total: 0 });
    const explicit_bases = vi.fn().mockResolvedValue({ rows: [], total: 0 });
    await solve_query(VAULT_ID, bare.query, make_backends(bare_bases));
    await solve_query(VAULT_ID, explicit.query, make_backends(explicit_bases));

    expect(bare_bases.mock.calls).toEqual(explicit_bases.mock.calls);
  });
});
