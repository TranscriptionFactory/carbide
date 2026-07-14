import { describe, it, expect } from "vitest";
import { suggest_query } from "$lib/features/query/domain/query_suggestions";
import type { DslContext } from "$lib/shared/types/dsl_suggestion";

const ctx: DslContext = {
  tags: ["project", "personal", "prospect"],
  note_names: ["Alpha", "Beta", "alto"],
  folder_paths: ["work/reports", "work/notes", "personal"],
  property_names: ["status", "due", "priority"],
};

function labels(text: string, c: DslContext = ctx): string[] {
  return suggest_query(text, c).items.map((i) => i.label);
}

function inserts(text: string, c: DslContext = ctx): string[] {
  return suggest_query(text, c).items.map((i) => i.insert);
}

describe("suggest_query positional candidates", () => {
  it("suggests forms on empty input", () => {
    expect(labels("")).toEqual([
      "notes",
      "note",
      "folders",
      "folder",
      "files",
      "file",
    ]);
  });

  it("suggests clause starters after a form", () => {
    expect(labels("notes ")).toEqual([
      "named",
      "with",
      "in",
      "linked from",
      "not",
      "(",
    ]);
  });

  it("suggests clause starters after a join", () => {
    expect(labels('notes named "x" and ')).toEqual([
      "named",
      "with",
      "in",
      "linked from",
      "not",
      "(",
    ]);
  });

  it("suggests clause starters after a group opener", () => {
    expect(labels("notes (")).toEqual([
      "named",
      "with",
      "in",
      "linked from",
      "not",
      "(",
    ]);
  });

  it("offers quote, regex and quoted note names after named", () => {
    const res = suggest_query("notes named ", ctx);
    expect(res.items.map((i) => i.label)).toContain('"');
    expect(res.items.map((i) => i.label)).toContain("/");
    expect(res.items.map((i) => i.label)).toContain("Alpha");
    expect(res.items.find((i) => i.label === "Alpha")?.insert).toBe('"Alpha"');
  });

  it("offers tags and property names after with", () => {
    const res = labels("notes with ");
    expect(res).toContain("project");
    expect(res).toContain("status");
    expect(inserts("notes with ")).toContain("#project");
  });

  it("offers quoted folder paths and wikilink opener after in", () => {
    const res = labels("notes in ");
    expect(res).toContain('"');
    expect(res).toContain("[[");
    expect(res).toContain("work/reports");
    expect(inserts("notes in ")).toContain('"work/reports"');
  });

  it("suggests from after linked", () => {
    expect(labels("notes linked ")).toEqual(["from"]);
  });

  it("suggests wikilink note names after linked from", () => {
    const res = suggest_query("notes linked from ", ctx);
    expect(res.items.map((i) => i.label)).toEqual(["Alpha", "Beta", "alto"]);
    expect(res.items.find((i) => i.label === "Alpha")?.insert).toBe(
      "[[Alpha]]",
    );
  });

  it("suggests property operators after a with-property", () => {
    expect(labels("notes with status ")).toEqual([
      "=",
      "!=",
      ">",
      "<",
      ">=",
      "<=",
      "contains",
    ]);
  });

  it("offers builtin date properties after with", () => {
    expect(labels("notes with ")).toEqual(
      expect.arrayContaining(["created", "modified", "accessed"]),
    );
  });

  it("suggests property operators after a builtin date property", () => {
    expect(labels("notes with created ")).toEqual([
      "=",
      "!=",
      ">",
      "<",
      ">=",
      "<=",
      "contains",
    ]);
  });

  it("suggests relative date values after a property operator", () => {
    expect(labels("notes with created > ")).toEqual([
      '"now()-1d"',
      '"now()-7d"',
      '"now()-30d"',
      '"now()"',
    ]);
  });

  it("suggests connectives after a complete clause", () => {
    expect(labels('notes named "foo" ')).toEqual(["and", "or"]);
  });
});

describe("suggest_query prefix filtering", () => {
  it("filters tags by prefix after #", () => {
    const res = suggest_query("notes with #pro", ctx);
    expect(res.items.map((i) => i.label)).toEqual(["project", "prospect"]);
    expect(res.from).toBe("notes with ".length);
  });

  it("is case-insensitive on the partial token", () => {
    expect(labels("notes with #PRO")).toEqual(["project", "prospect"]);
    expect(labels("NO")).toEqual(["notes", "note"]);
  });

  it("filters forms by prefix", () => {
    expect(labels("fo")).toEqual(["folders", "folder"]);
  });
});

describe("suggest_query unclosed constructs", () => {
  it("suggests note names inside an unclosed wikilink", () => {
    const res = suggest_query("notes linked from [[al", ctx);
    expect(res.items.map((i) => i.label)).toEqual(["Alpha", "alto"]);
    expect(res.from).toBe("notes linked from [[".length);
    expect(res.items.find((i) => i.label === "alto")?.insert).toBe("alto]]");
  });

  it("suggests folder paths inside an unclosed quote after in", () => {
    const res = suggest_query('notes in "work', ctx);
    expect(res.items.map((i) => i.label)).toEqual([
      "work/reports",
      "work/notes",
    ]);
    expect(res.from).toBe('notes in "'.length);
    expect(res.items[0]?.insert).toBe('work/reports"');
  });

  it("suggests note names inside an unclosed quote after named", () => {
    const res = suggest_query('notes named "al', ctx);
    expect(res.items.map((i) => i.label)).toEqual(["Alpha", "alto"]);
    expect(res.items[0]?.insert).toBe('Alpha"');
  });
});

describe("suggest_query closers", () => {
  it("offers a closing paren for an unbalanced group", () => {
    const res = suggest_query('notes (named "foo" ', ctx);
    expect(res.items.map((i) => i.label)).toContain(")");
    expect(res.items.map((i) => i.label)).toContain("and");
  });

  it("does not offer a closer when parens are balanced", () => {
    const res = suggest_query('notes (named "foo") ', ctx);
    expect(res.items.map((i) => i.label)).not.toContain(")");
  });
});

describe("suggest_query subquery recursion", () => {
  it("recurses into an unclosed subquery and offers forms", () => {
    const res = suggest_query("notes linked from {", ctx);
    expect(res.items.map((i) => i.label)).toEqual([
      "notes",
      "note",
      "folders",
      "folder",
      "files",
      "file",
    ]);
    expect(res.from).toBe("notes linked from {".length);
  });

  it("shifts from by the subquery offset", () => {
    const res = suggest_query("notes linked from {notes with #pro", ctx);
    expect(res.items.map((i) => i.label)).toEqual(["project", "prospect"]);
    expect(res.from).toBe("notes linked from {notes with ".length);
  });

  it("closes the subquery once its clause is complete", () => {
    const res = suggest_query('notes linked from {notes named "x" ', ctx);
    expect(res.items.map((i) => i.label)).toContain("}");
  });
});

describe("suggest_query newline handling", () => {
  it("treats newlines as whitespace", () => {
    expect(labels("notes\n")).toEqual([
      "named",
      "with",
      "in",
      "linked from",
      "not",
      "(",
    ]);
    expect(labels("notes with\n#pro")).toEqual(["project", "prospect"]);
  });
});

describe("suggest_query from offsets", () => {
  it("points from at the start of the current partial token", () => {
    expect(suggest_query("notes na", ctx).from).toBe("notes ".length);
    expect(suggest_query("notes ", ctx).from).toBe("notes ".length);
    expect(suggest_query("", ctx).from).toBe(0);
  });
});
