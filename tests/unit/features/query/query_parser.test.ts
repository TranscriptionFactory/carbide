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

    it("parses Folders form", () => {
      const result = parse_query('Folders named "archive"');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.query.form).toBe("folders");
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
