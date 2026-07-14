import { describe, expect, it } from "vitest";
import { should_attach_open_note_images } from "$lib/features/rag/domain/rag_open_note_images";

const note = { note_path: "projects/design/mockups.md", note_title: "Mockups" };

describe("should_attach_open_note_images", () => {
  it("skips images for a vault-wide question with no scope", () => {
    expect(
      should_attach_open_note_images({
        question: "what did I write last week?",
        scope: {},
        ...note,
      }),
    ).toBe(false);
  });

  it("attaches when the question @mentions the note title", () => {
    expect(
      should_attach_open_note_images({
        question: "explain the diagram in @Mockups",
        scope: {},
        ...note,
      }),
    ).toBe(true);
  });

  it("matches mentions case-insensitively against the file basename", () => {
    expect(
      should_attach_open_note_images({
        question: "what does @mockups show?",
        scope: {},
        ...note,
      }),
    ).toBe(true);
  });

  it("attaches when the note sits inside an active folder scope", () => {
    expect(
      should_attach_open_note_images({
        question: "summarize the designs",
        scope: { folders: ["projects/design"] },
        ...note,
      }),
    ).toBe(true);
  });

  it("skips when the folder scope does not contain the note", () => {
    expect(
      should_attach_open_note_images({
        question: "summarize the designs",
        scope: { folders: ["journal"] },
        ...note,
      }),
    ).toBe(false);
  });

  it("treats tag scopes as out of scope without a mention", () => {
    expect(
      should_attach_open_note_images({
        question: "summarize the designs",
        scope: { tags: ["design"] },
        ...note,
      }),
    ).toBe(false);
  });

  it("ignores mentions of other notes", () => {
    expect(
      should_attach_open_note_images({
        question: "compare with @Roadmap",
        scope: {},
        ...note,
      }),
    ).toBe(false);
  });
});
