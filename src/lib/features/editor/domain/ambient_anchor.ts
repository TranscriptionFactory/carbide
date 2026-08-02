import type { Node as ProseNode } from "prosemirror-model";
import type { AmbientAnchor } from "$lib/features/assistant";
import type { FindMatchRange, FindOptions } from "./find_types";
import { find_literal_matches_in_doc } from "./find_literal_matcher";

// Case-sensitive and not whole-word: the producer emits the exact rendered text
// it found, so a looser match would underline prose the finding never saw.
const ANCHOR_FIND_OPTIONS: FindOptions = {
  case_sensitive: true,
  whole_word: false,
};

// Re-resolved from the note's text on every call rather than mapped through
// transactions: an anchor whose text was edited away must STOP resolving, and a
// mapped range would survive as a stale underline over unrelated prose.
export function resolve_ambient_anchor(
  doc: ProseNode,
  anchor: AmbientAnchor,
): FindMatchRange | null {
  if (anchor.kind === "note") return null;

  const matches = find_literal_matches_in_doc(
    doc,
    anchor.match,
    ANCHOR_FIND_OPTIONS,
  );
  return matches[anchor.occurrence] ?? null;
}
