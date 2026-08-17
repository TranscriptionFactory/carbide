import { describe, expect, it } from "vitest";
import { parse_query } from "$lib/features/query/domain/query_parser";

describe("query_parser", () => {
  describe("forms", () => {
    it("defaults to notes form when no form specified", () => {
      const result = parse_query('with "hello"');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.query.form).toBe("notes");
    });

    it("parses Notes form", () => {
      const result = parse_query('Notes with "hello"');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.query.form).toBe("notes");
    });

    it("rejects folders and files as forms", () => {
      expect(parse_query('Folders named "archive"').ok).toBe(false);
      expect(parse_query('files named "archive"').ok).toBe(false);
    });

    it("is case insensitive for forms", () => {
      const result = parse_query('notes with "hello"');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.query.form).toBe("notes");
    });
  });

  describe("with clause", () => {
    it("parses with quoted text", () => {
      const result = parse_query('Notes with "hello world"');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const clause = result.query.root;
      expect(clause).toMatchObject({
        type: "with",
        negated: false,
        value: { kind: "text", value: "hello world" },
      });
    });

    it("parses with tag", () => {
      const result = parse_query("Notes with #project");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        type: "with",
        value: { kind: "tag", tag: "project" },
      });
    });

    it("parses hierarchical tag", () => {
      const result = parse_query("Notes with #project/carbide");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        type: "with",
        value: { kind: "tag", tag: "project/carbide" },
      });
    });

    // parse_with_clause used to branch on value.kind === "tag" and return a
    // byte-identical literal from both arms; the clause shape must not depend
    // on the value kind.
    it.each([
      ['Notes with "project"', "text"],
      ["Notes with /proj.*/", "regex"],
      ["Notes with [[Projects]]", "wikilink"],
    ])("builds the same with-clause shape for %s as for a tag", (query) => {
      const tagged = parse_query("Notes with #project");
      const untagged = parse_query(query);

      expect(tagged.ok).toBe(true);
      expect(untagged.ok, `failed to parse: ${query}`).toBe(true);
      if (!tagged.ok || !untagged.ok) return;

      expect(Object.keys(tagged.query.root).sort()).toEqual(
        Object.keys(untagged.query.root).sort(),
      );
      expect({ ...tagged.query.root, value: undefined }).toEqual({
        ...untagged.query.root,
        value: undefined,
      });
      expect(tagged.query.root).toMatchObject({
        kind: "clause",
        type: "with",
        negated: false,
      });
    });
  });

  describe("named clause", () => {
    it("parses named with quoted text", () => {
      const result = parse_query('Notes named "architecture"');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        type: "named",
        value: { kind: "text", value: "architecture" },
      });
    });

    it("parses named with regex", () => {
      const result = parse_query("Notes named /^2024.*/i");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        type: "named",
        value: { kind: "regex", pattern: "^2024.*", flags: "i" },
      });
    });
  });

  describe("in clause", () => {
    it("parses in with wikilink", () => {
      const result = parse_query("Notes in [[Projects]]");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        type: "in",
        value: { kind: "wikilink", target: "Projects" },
      });
    });

    it("parses in with quoted text", () => {
      const result = parse_query('Notes in "Archive"');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        type: "in",
        value: { kind: "text", value: "Archive" },
      });
    });
  });

  describe("linked from clause", () => {
    it("parses linked from with wikilink", () => {
      const result = parse_query("Notes linked from [[Index]]");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        type: "linked_from",
        value: { kind: "wikilink", target: "Index" },
      });
    });
  });

  describe("negation", () => {
    it("parses not with tag", () => {
      const result = parse_query("Notes not with #deprecated");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        type: "with",
        negated: true,
        value: { kind: "tag", tag: "deprecated" },
      });
    });
  });

  describe("joins", () => {
    it("parses AND join", () => {
      const result = parse_query('Notes with #project and with "deadline"');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        kind: "group",
        join: "and",
      });
      if (result.query.root.kind !== "group") return;
      expect(result.query.root.clauses).toHaveLength(2);
    });

    it("parses OR join", () => {
      const result = parse_query("Notes with #important or with #urgent");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        kind: "group",
        join: "or",
      });
    });

    it("parses multiple AND clauses", () => {
      const result = parse_query(
        'Notes with #project and in [[Archive]] and named "old"',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({ kind: "group", join: "and" });
      if (result.query.root.kind !== "group") return;
      expect(result.query.root.clauses).toHaveLength(3);
    });
  });

  describe("property clauses", () => {
    it("parses with property = value", () => {
      const result = parse_query('Notes with status = "done"');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        type: "with_property",
        property_name: "status",
        property_operator: "=",
        value: { kind: "text", value: "done" },
      });
    });

    it.each(["=", "!=", ">", "<", ">=", "<=", "contains"])(
      "parses the %s operator without absorbing it into the value",
      (operator) => {
        const result = parse_query(`Notes with due ${operator} "now()-7d"`);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.query.root).toMatchObject({
          type: "with_property",
          property_name: "due",
          property_operator: operator,
          value: { kind: "text", value: "now()-7d" },
        });
      },
    );

    // "contains" is a word operator and stays whitespace-delimited; only the
    // symbolic operators can abut the property name in hand-typed input.
    const SYMBOLIC_OPERATORS = ["=", "!=", ">", "<", ">=", "<="];

    it.each(SYMBOLIC_OPERATORS)(
      'parses a hand-typed due%s"now()-7d" exactly like the spaced form',
      (operator) => {
        const tight = parse_query(`Notes with due${operator}"now()-7d"`);
        const spaced = parse_query(`Notes with due ${operator} "now()-7d"`);

        expect(
          tight.ok,
          `failed to parse: Notes with due${operator}"now()-7d"`,
        ).toBe(true);
        expect(spaced.ok).toBe(true);
        if (!tight.ok || !spaced.ok) return;

        expect(tight.query).toEqual(spaced.query);
        expect(tight.query.root).toMatchObject({
          type: "with_property",
          property_name: "due",
          property_operator: operator,
          value: { kind: "text", value: "now()-7d" },
        });
      },
    );

    it.each(SYMBOLIC_OPERATORS)(
      "parses a hand-typed bare value after %s",
      (operator) => {
        const tight = parse_query(`Notes with priority${operator}3`);
        const spaced = parse_query(`Notes with priority ${operator} 3`);

        expect(tight.ok).toBe(true);
        expect(spaced.ok).toBe(true);
        if (!tight.ok || !spaced.ok) return;

        expect(tight.query).toEqual(spaced.query);
        expect(tight.query.root).toMatchObject({
          type: "with_property",
          property_name: "priority",
          property_operator: operator,
          value: { kind: "text", value: "3" },
        });
      },
    );

    it("keeps contains whitespace-delimited and does not truncate a property name that contains it", () => {
      const result = parse_query('Notes with contains_count >= "3"');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({
        type: "with_property",
        property_name: "contains_count",
        property_operator: ">=",
        value: { kind: "text", value: "3" },
      });
    });
  });

  describe("grouping", () => {
    it("parses parenthesized groups", () => {
      const result = parse_query(
        "Notes (with #a or with #b) and in [[Projects]]",
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("error handling", () => {
    it("returns error for empty query", () => {
      const result = parse_query("");
      expect(result.ok).toBe(false);
    });

    it("returns error for whitespace-only query", () => {
      const result = parse_query("   ");
      expect(result.ok).toBe(false);
    });

    it("returns error for form without clause", () => {
      const result = parse_query("Notes");
      expect(result.ok).toBe(false);
    });
  });

  describe("complex queries", () => {
    it("parses full complex query", () => {
      const result = parse_query(
        'Notes in [[Projects]] and with #carbide and named "architecture"',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.form).toBe("notes");
      expect(result.query.root).toMatchObject({ kind: "group", join: "and" });
      if (result.query.root.kind !== "group") return;
      expect(result.query.root.clauses).toHaveLength(3);
    });

    it("parses negated clause in chain", () => {
      const result = parse_query(
        "Notes with #project and not with #deprecated",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.query.root).toMatchObject({ kind: "group", join: "and" });
      if (result.query.root.kind !== "group") return;
      expect(result.query.root.clauses[1]).toMatchObject({
        type: "with",
        negated: true,
        value: { kind: "tag", tag: "deprecated" },
      });
    });
  });
});
