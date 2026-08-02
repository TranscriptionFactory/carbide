import type { RunKind } from "$lib/features/assistant/types/run";

// One table for both unions: AssistantSessionKind ("inline" | "note" | "chat")
// is a strict subset of RunKind, so a session kind indexes this safely.
//
// `agent` deliberately shares `chat`'s glyph — agent is chat's other mode, not
// another surface, and the panel already separates them with its
// vault-scoped/full-access badge. `background` must NOT share `note`'s: an
// ambient run and a run against a note are the two things the runs popover
// exists to tell apart.
export const KIND_GLYPHS: Record<RunKind, string> = {
  inline: "⌁",
  note: "▤",
  chat: "◈",
  agent: "◈",
  background: "◌",
};
