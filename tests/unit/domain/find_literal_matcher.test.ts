import { describe, expect, it } from "vitest";
import { Schema } from "prosemirror-model";
import {
  find_literal_matches_in_doc,
  find_literal_matches_in_text,
} from "$lib/features/editor/domain/find_literal_matcher";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
  marks: {
    strong: {},
  },
});

function paragraph_doc(
  text_runs: ReadonlyArray<{ text: string; strong?: boolean }>,
) {
  return schema.node("doc", null, [
    schema.node(
      "paragraph",
      null,
      text_runs.map((run) =>
        schema.text(run.text, run.strong ? [schema.mark("strong")] : undefined),
      ),
    ),
  ]);
}

describe("find_literal_matches_in_text", () => {
  it("empty query returns no matches", () => {
    expect(
      find_literal_matches_in_text("alpha beta", "", {
        case_sensitive: false,
        whole_word: false,
      }),
    ).toEqual([]);
  });

  it("literal matching finds all non-overlapping matches", () => {
    expect(
      find_literal_matches_in_text("aaaa", "aa", {
        case_sensitive: false,
        whole_word: false,
      }),
    ).toEqual([
      { start: 0, end: 2, text: "aa" },
      { start: 2, end: 4, text: "aa" },
    ]);
  });

  it("case-insensitive matching", () => {
    expect(
      find_literal_matches_in_text("Alpha alpha ALPHA", "alpha", {
        case_sensitive: false,
        whole_word: false,
      }).map((match) => match.text),
    ).toEqual(["Alpha", "alpha", "ALPHA"]);
  });

  it("case-sensitive matching", () => {
    expect(
      find_literal_matches_in_text("Alpha alpha ALPHA", "alpha", {
        case_sensitive: true,
        whole_word: false,
      }).map((match) => match.text),
    ).toEqual(["alpha"]);
  });

  it("whole-word matching uses ASCII word boundaries", () => {
    expect(
      find_literal_matches_in_text("cat catalog cat_cat cat.", "cat", {
        case_sensitive: false,
        whole_word: true,
      }).map((match) => match.start),
    ).toEqual([0, 20]);
  });
});

describe("find_literal_matches_in_doc", () => {
  it("maps text-node offsets back to ProseMirror positions", () => {
    const doc = paragraph_doc([
      { text: "hello " },
      { text: "hello", strong: true },
    ]);
    expect(
      find_literal_matches_in_doc(doc, "hello", {
        case_sensitive: false,
        whole_word: false,
      }),
    ).toEqual([
      { from: 1, to: 6, text: "hello" },
      { from: 7, to: 12, text: "hello" },
    ]);
  });

  it("does not match across text node boundaries", () => {
    const doc = paragraph_doc([{ text: "hel" }, { text: "lo", strong: true }]);
    expect(
      find_literal_matches_in_doc(doc, "hello", {
        case_sensitive: false,
        whole_word: false,
      }),
    ).toEqual([]);
  });
});

describe("find_literal_matches_in_doc with a range", () => {
  function two_paragraph_doc(first: string, second: string) {
    return schema.node("doc", null, [
      schema.node("paragraph", null, schema.text(first)),
      schema.node("paragraph", null, schema.text(second)),
    ]);
  }

  const options = { case_sensitive: false, whole_word: false };

  it("ignores matches outside the range", () => {
    const doc = two_paragraph_doc("foo one", "foo two");
    const second_paragraph_start = doc.child(0).nodeSize + 1;

    expect(
      find_literal_matches_in_doc(doc, "foo", {
        ...options,
        range: { from: second_paragraph_start, to: doc.content.size },
      }),
    ).toEqual([
      {
        from: second_paragraph_start,
        to: second_paragraph_start + 3,
        text: "foo",
      },
    ]);
  });

  it("excludes a match that straddles the range edge", () => {
    const doc = paragraph_doc([{ text: "foofoo" }]);
    expect(find_literal_matches_in_doc(doc, "foo", options)).toEqual([
      { from: 1, to: 4, text: "foo" },
      { from: 4, to: 7, text: "foo" },
    ]);

    expect(
      find_literal_matches_in_doc(doc, "foo", {
        ...options,
        range: { from: 3, to: 7 },
      }),
    ).toEqual([{ from: 4, to: 7, text: "foo" }]);
  });

  it("matches the whole document when no range is given", () => {
    const doc = two_paragraph_doc("foo one", "foo two");
    expect(find_literal_matches_in_doc(doc, "foo", options)).toHaveLength(2);
  });
});
