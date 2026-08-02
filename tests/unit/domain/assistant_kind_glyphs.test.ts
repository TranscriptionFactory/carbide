import { describe, expect, it } from "vitest";
import { KIND_GLYPHS } from "$lib/features/assistant/domain/kind_glyphs";
import type { RunKind } from "$lib/features/assistant/types/run";
import type { AssistantSessionKind } from "$lib/features/assistant/types/session";

const ALL_RUN_KINDS: RunKind[] = [
  "inline",
  "note",
  "chat",
  "agent",
  "background",
];

const ALL_SESSION_KINDS: AssistantSessionKind[] = ["inline", "note", "chat"];

describe("assistant kind glyphs", () => {
  it("gives every run kind a non-empty glyph", () => {
    for (const kind of ALL_RUN_KINDS) {
      expect(KIND_GLYPHS[kind], `no glyph for run kind "${kind}"`).toBeTruthy();
    }
  });

  it("covers every session kind from the same table", () => {
    for (const kind of ALL_SESSION_KINDS) {
      expect(
        KIND_GLYPHS[kind],
        `no glyph for session kind "${kind}"`,
      ).toBeTruthy();
    }
  });

  it("distinguishes a background run from a note run", () => {
    expect(KIND_GLYPHS.background).not.toBe(KIND_GLYPHS.note);
  });

  // Asserted as intended, not incidental: agent is chat's other mode rather
  // than another surface, and the panel separates them with its
  // vault-scoped/full-access badge. This test exists so a future reader does
  // not "fix" a deliberate choice.
  it("deliberately shares one glyph between chat and agent", () => {
    expect(KIND_GLYPHS.agent).toBe(KIND_GLYPHS.chat);
  });

  it("leaves inline, note and chat mutually distinct", () => {
    const glyphs = [KIND_GLYPHS.inline, KIND_GLYPHS.note, KIND_GLYPHS.chat];
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});
