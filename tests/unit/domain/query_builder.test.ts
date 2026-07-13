import { describe, it, expect } from "vitest";
import {
  build_query_text,
  type QueryBuilderSpec,
} from "$lib/features/query/domain/query_builder";
import { parse_query } from "$lib/features/query/domain/query_parser";

function expect_parses(text: string) {
  const result = parse_query(text);
  expect(result.ok, `failed to parse: ${text}`).toBe(true);
}

describe("build_query_text", () => {
  it("emits a single named clause with the form prefix", () => {
    const spec: QueryBuilderSpec = {
      form: "notes",
      clauses: [{ clause: { kind: "named", name: "todo" } }],
    };
    expect(build_query_text(spec)).toBe('notes named "todo"');
  });

  it("renders each clause kind", () => {
    const spec: QueryBuilderSpec = {
      form: "notes",
      clauses: [
        { clause: { kind: "named", name: "meeting" } },
        { connective: "and", clause: { kind: "tag", tag: "urgent" } },
        { connective: "and", clause: { kind: "folder", folder: "work" } },
        { connective: "and", clause: { kind: "linked_from", note: "Index" } },
        {
          connective: "and",
          clause: {
            kind: "property",
            property: "status",
            operator: "=",
            value: "open",
          },
        },
      ],
    };
    expect(build_query_text(spec)).toBe(
      'notes named "meeting" and with #urgent and in "work" and ' +
        'linked from "Index" and with status = "open"',
    );
    expect_parses(build_query_text(spec));
  });

  it("negates clauses with a not prefix", () => {
    const spec: QueryBuilderSpec = {
      form: "files",
      clauses: [
        { clause: { kind: "named", negated: true, name: "draft" } },
        {
          connective: "or",
          clause: { kind: "folder", negated: true, folder: "archive" },
        },
      ],
    };
    expect(build_query_text(spec)).toBe(
      'files not named "draft" or not in "archive"',
    );
    expect_parses(build_query_text(spec));
  });

  it("defaults the connective to and when omitted", () => {
    const spec: QueryBuilderSpec = {
      form: "notes",
      clauses: [
        { clause: { kind: "named", name: "a" } },
        { clause: { kind: "named", name: "b" } },
      ],
    };
    expect(build_query_text(spec)).toBe('notes named "a" and named "b"');
  });

  describe("round-trips through the parser", () => {
    it("handles values with spaces", () => {
      const spec: QueryBuilderSpec = {
        form: "notes",
        clauses: [
          { clause: { kind: "named", name: "weekly review" } },
          {
            connective: "and",
            clause: { kind: "folder", folder: "team notes/2026" },
          },
        ],
      };
      expect_parses(build_query_text(spec));
    });

    it("handles values with reserved words", () => {
      const spec: QueryBuilderSpec = {
        form: "notes",
        clauses: [
          { clause: { kind: "named", name: "cats and dogs or birds" } },
          {
            connective: "and",
            clause: { kind: "linked_from", note: "not a real note" },
          },
        ],
      };
      expect_parses(build_query_text(spec));
    });

    it("handles values with quotes and backslashes", () => {
      const spec: QueryBuilderSpec = {
        form: "notes",
        clauses: [
          { clause: { kind: "named", name: 'say "hi"' } },
          {
            connective: "and",
            clause: { kind: "folder", folder: "path\\with\\slashes" },
          },
          {
            connective: "and",
            clause: {
              kind: "property",
              property: "title",
              operator: "contains",
              value: 'a "quoted" \\ value',
            },
          },
        ],
      };
      expect_parses(build_query_text(spec));
    });

    it("handles every property operator", () => {
      const operators = ["=", "!=", ">", "<", ">=", "<=", "contains"] as const;
      for (const operator of operators) {
        const spec: QueryBuilderSpec = {
          form: "notes",
          clauses: [
            {
              clause: {
                kind: "property",
                property: "priority",
                operator,
                value: "high",
              },
            },
          ],
        };
        expect_parses(build_query_text(spec));
      }
    });

    it("round-trips both connectives across a chain", () => {
      const spec: QueryBuilderSpec = {
        form: "folders",
        clauses: [
          { clause: { kind: "named", name: "one" } },
          { connective: "or", clause: { kind: "named", name: "two" } },
          { connective: "and", clause: { kind: "tag", tag: "keep" } },
        ],
      };
      expect_parses(build_query_text(spec));
    });
  });
});
