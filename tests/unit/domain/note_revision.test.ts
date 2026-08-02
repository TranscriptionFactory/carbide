import { describe, expect, it } from "vitest";
import { compute_note_revision, is_stale } from "$lib/features/assistant";

describe("compute_note_revision", () => {
  it("is deterministic for the same content", () => {
    const content = "weights are still hand-tuned";
    expect(compute_note_revision(content)).toBe(compute_note_revision(content));
  });

  it("does not throw on empty content", () => {
    expect(() => compute_note_revision("")).not.toThrow();
  });

  it("differs for content that differs only by trailing whitespace", () => {
    expect(compute_note_revision("weights are tuned")).not.toBe(
      compute_note_revision("weights are tuned "),
    );
  });

  it("differs for content that differs only by line ending", () => {
    expect(compute_note_revision("a\nb")).not.toBe(
      compute_note_revision("a\r\nb"),
    );
  });

  it("differs across a representative corpus of near-identical notes", () => {
    const revisions = new Set(
      [
        "short",
        "short ",
        "short\n",
        "a much longer note body ".repeat(50),
        "unicode: café — 😀",
        "unicode: café — 😀",
      ].map((content) => compute_note_revision(content)),
    );
    expect(revisions.size).toBe(6);
  });
});

describe("is_stale", () => {
  it("is false when the content matches what produced the base revision (no-op save)", () => {
    const content = "weights are still hand-tuned";
    const base_revision = compute_note_revision(content);
    expect(is_stale(base_revision, content)).toBe(false);
  });

  it("is true for a single-character edit", () => {
    const base_revision = compute_note_revision("weights are still hand-tuned");
    expect(is_stale(base_revision, "weights are still hand-tunedX")).toBe(true);
  });

  it("is true for a whitespace-only edit", () => {
    const base_revision = compute_note_revision("weights are tuned");
    expect(is_stale(base_revision, "weights are tuned ")).toBe(true);
  });

  it("is true against a base_revision that was never produced by compute_note_revision", () => {
    expect(is_stale("not-a-real-revision", "anything")).toBe(true);
  });
});
